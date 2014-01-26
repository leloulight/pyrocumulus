﻿App.Player = (function (jquery, underscore, ejs) {
    "use strict";

    var $ = jquery;
    var _ = underscore;
    var EJS = ejs;

    var Consts = {
        viewName: "player"
    };

    var _m = {
        model: null, // App.ViewModel.FileListViewModel
        containerSelector: "",
        $container: null,
        $positioner: null,
        $drawer: null,
        $nowPlaying: null, // TODO: Something nicer.
        $queue: null,
        audio: null,
        songList: [],
        currentSongIndex: 0
    };

    var init = function (containerId) {
        _m.containerSelector = "#" + containerId;
        _m.$container = $(_m.containerSelector);
        bindEventsOnce();

        render({});
    };

    var render = function (model) {
        if (model) {
            // Boilerplate.
            _m.model = model;
            var html = App.View.render(Consts.viewName, model);
            _m.$container.html(html);

            _m.audio = _m.$container.find("audio")[0];
            _m.audio.addEventListener("error", handlers.audioEvent, false);
            _m.audio.addEventListener("ended", handlers.audioEvent, false);

            _m.$positioner = _m.$container.find(".positioner");
            _m.$drawer = _m.$container.find(".drawer");
            _m.$nowPlaying = _m.$container.find("#nowPlaying");
            _m.$queue = _m.$container.find(".song-queue");
            handleResize();
            commands.toggleVisibility();
        }
    };

    var bindEventsOnce = function () {
        _m.$container.on("click", "a[data-command]", function (e) {
            e.preventDefault();
            var $target = $(e.currentTarget);
            var command = $target.data("command");

            commands[command](e);
        });
    };

    var handleResize = function () {
        _m.$positioner.css({
            height: $(window).height() + "px"
        });
    };

    var commands = {
        play: function () {
            _m.audio.play();
        },
        stop: function () {
            _m.audio.pause();
            clearSong();
        },
        previous: function () {
            if (_m.currentSongIndex > 0)
                _m.currentSongIndex--;

            loadSong();
            commands.play();
        },
        next: function () {
            if (_m.currentSongIndex < _m.songList.length - 1)
                _m.currentSongIndex++;

            loadSong();
            commands.play();
        },
        toggleVisibility: function () {
            if (_m.$drawer.hasClass("collapsed")) {
                _m.$drawer.removeClass("collapsed");
                _m.$drawer.css({ bottom: 0 + "px" });
            } else {
                var height = _m.$drawer.outerHeight();
                _m.$drawer.css({ bottom: "-" + height + "px" });
                _m.$drawer.addClass("collapsed");
            }
        },
        clearQueue: function () {
            commands.stop();
            clearSongList();
        },
        select: function (e) {
            var $item = $(e.currentTarget).closest(".item");
            var fileid = $item.data("fileid");
            loadSong(_m.songList.indexOf(fileid));
            commands.play();
        }
    };

    var handlers = {
        audioEvent: function (e) {
            // if the list is still true (ie not at the end of the list)
            // step to the next item either on ended or error
            if (_m.currentSongIndex < _m.songList.length) {
                _m.currentSongIndex++;
                loadSong();
                commands.play();
            } else {
                // action to indicate end of stream    
            }
        }
    };

    var loadSong = function (index) {
        index = index || _m.currentSongIndex;
        _m.currentSongIndex = index;

        if (index >= _m.songList.length) {
            return false;
        } else {
            _m.audio.autoplay = false;
            _m.audio.src = Pogoplug.getFileStreamUrl(_m.songList[index]);

            App.ViewModel.FileViewModel.load(_m.songList[index]).then(function (fileViewModel, parentDirectoryViewModel) {
                updateNowPlaying(fileViewModel, parentDirectoryViewModel);
            });

            return true;
        }
    };

    var playSong = function (fileid) {
        clearSong();
        _m.songList.push(fileid);
        _.defer(function () { renderQueue().done(); });
        _m.currentSongIndex = _m.songList.length - 1;
        loadSong();
        //_m.audio.src = url;
        commands.play();
    };

    var addSong = function (fileid) {
        _m.songList.push(fileid);
        renderQueue().done();
    };

    var addAllAndPlayFirst = function (fileids) {
        _m.songList = _m.songList.concat(fileids);
        _.defer(function () { renderQueue().done(); });
        _m.currentSongIndex = _m.songList.length - fileids.length;
        loadSong();
        commands.play();
    };

    var addAll = function (fileids) {
        _m.songList = _m.songList.concat(fileids);
        renderQueue().done();
    };

    var clearSongList = function () {
        _m.songList = [];
        renderQueue().done();
    };

    var clearSong = function () {
        _m.audio.src = "";
        // or
        _m.audio.removeAttribute("src");
    };

    var renderQueue = function () {
        var deferred = $.Deferred();

        var fileVMPromises = [];
        _m.songList.forEach(function (fileid) {
            fileVMPromises.push(App.ViewModel.FileViewModel.load(fileid));
        });

        $.whenall(fileVMPromises).done(function (fileVMPromiseResults) {
            // This is lame, but it should be an array of two return args (2-item arr), but if only one promise, the result is one 2-item arr.
            fileVMPromiseResults = fileVMPromises.length === 1 ? [fileVMPromiseResults] : fileVMPromiseResults;

            var fileResults = App.ViewModel.getArrayResult(fileVMPromiseResults);
            _m.$queue.html(App.View.render("itemList", { list: fileResults }));
            var itemWidth = _m.$queue.find(".item").first().outerWidth(true);
            _m.$queue.find(".list").width(itemWidth * fileResults.length + 200); // TODO: Remove 200 when we trust the calculation.

            fileVMPromiseResults.forEach(function (fileVMPromiseResult) {
                var songViewModel = fileVMPromiseResult[0];
                var directoryViewModel = fileVMPromiseResult[1];
                App.ViewModel.FileListViewModel.load(songViewModel.file.parentid).then(function (fileListViewModel) {
                    var thumbnailFile = fileListViewModel.getThumbnail();
                    if (!!thumbnailFile) {
                        var thumbId = !!thumbnailFile ? thumbnailFile.file.thumbnail || thumbnailFile.file.fileid : "";
                        var url = Pogoplug.getFileStreamUrl(thumbId);

                        if (!!url) {
                            var $item = _m.$queue
                                .find(".item[data-fileid='" + songViewModel.file.fileid + "'] .image-container")
                                .css("background-image", App.Utils.formatBackgroundImageCss(url));
                        }
                    }
                });
            });

            deferred.resolve();
        });

        return deferred.promise();
    };

    // TODO: Something nicer.
    var updateNowPlaying = function (songViewModel, parentDirectoryViewModel) {
        _m.$nowPlaying.find("[data-bind]").each(function (i, el) {
            var $el = $(el);
            var prop = $el.data("bind");
            var val = songViewModel[prop];
            $el.html(val);
        });
    };

    return {
        init: init,
        playSong: playSong,
        addSong: addSong,
        addAllAndPlayFirst: addAllAndPlayFirst,
        addAll: addAll,
        handleResize: handleResize
    };
})($, _, EJS);