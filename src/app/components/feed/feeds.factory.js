/*
 * Copyright (C) 2015 SUSE Linux
 *
 * This software may be modified and distributed under the terms
 * of the MIT license.  See the LICENSE.txt file for details.
 */

(function () {
  'use strict';

  angular.module('janusHangouts')
    .factory('Feed', feedFactory);

  feedFactory.$inject = ['$timeout', 'DataChannelService', 'Notifier'];

  /**
   * Factory representing a janus feed
   * @constructor
   */
  function feedFactory($timeout, DataChannelService, Notifier) {
    return function(attrs) {
      attrs = attrs || {};
      var that = this;

      this.id = attrs.id || 0;
      this.display = attrs.display || null;
      this.connection = attrs.connection || null;
      this.stream = attrs.stream || null;
      this.isPublisher = attrs.isPublisher || false;
      this.isLocalScreen = attrs.isLocalScreen || false;
      this.isIgnored = attrs.ignored || false;

      var picture = null;
      var speaking = false;
      var silentSince = Date.now();
      var videoRemoteEnabled = null;
      var audioRemoteEnabled = null;

      /**
       * Checks if a given channel is enabled
       *
       * @param {string} channel - "audio" or "video"
       * @returns {boolean}
       */
      this.isEnabled = function(channel) {
        if (this.isPublisher) {
          if (this.connection && this.connection.getConfig()) {
            return this.connection.getConfig()[channel];
          } else {
            return null;
          }
        } else {
          return (channel === "audio") ? audioRemoteEnabled : videoRemoteEnabled;
        }
      };

      this.setPicture = function(val) {
        picture = val;
      };

      this.getPicture = function() { return picture; };

      this.setSpeaking = function(val) {
        speaking = val;
      };

      this.getSpeaking = function() { return speaking; };

      this.setAudioEnabled = function(val) {
        audioRemoteEnabled = val;
      };

      this.getAudioEnabled = function() {
        return this.isEnabled("audio");
      };

      this.setVideoEnabled = function(val) {
        videoRemoteEnabled = val;
      };

      this.getVideoEnabled = function() {
        return this.isEnabled("video");
      };

      this.isDataOpen = function() {
        if (this.connection) {
          return this.connection.isDataOpen;
        } else {
          return false;
        }
      };

      /**
       * Checks if the feed is waiting for the connection to janus to be set
       *
       * @returns {boolean}
       */
      this.waitingForConnection = function() {
        return (this.isIgnored === false && !this.connection);
      };

      /*
       * Enables or disables the given channel
       *
       * If the feed is a publisher, it directly configures the connection to
       * Janus. If the feed is a subscriber, it request the configuration change
       * to the remote peer (only for audio, management of remote video is not
       * implemented).
       *
       * @param {string} type - "audio" or "video"
       * @param {boolean} enabled
       */
      this.setEnabledChannel = function(type, enabled) {
        var that = this;

        if (this.isPublisher) {
          var config = {};
          config[type] = enabled;
          this.connection.setConfig({
            values: config,
            success: function() {
              $timeout(function() {
                if (type === 'audio' && enabled === false) {
                  speaking = false;
                }
                // Send the new status to remote peers
                DataChannelService.sendStatus(that, {exclude: "picture"});
              });
            }
          });
        } else if (type === "audio" && enabled === false) {
          DataChannelService.sendMuteRequest(this);
        }
      };

      /**
       * Sets the value of the speaking attribute for this publisher feed,
       * honoring the value of audioEnabled and notifying changes to the
       * remote peers if needed.
       */
      this.updateLocalSpeaking = function(val) {
        var that = this;
        $timeout(function() {
          if (that.isEnabled("audio") === false) {
            if (val) {
              // TODO: introduce some timeout or any other mechanism to avoid
              // repeating the notification over and over for the same speech
              Notifier.info("Looks like you are trying to say something... but you are muted.");
            }
            val = false;
          }
          if (speaking !== val) {
            speaking = val;
            if (val === false) { silentSince = Date.now(); }
            DataChannelService.sendStatus(that, {exclude: "picture"});
          }
        });
      };

      /**
       * Sets the value of the picture attribute for this publisher feed,
       * notifying changes to the remote peers.
       */
      this.updateLocalPic = function(data) {
        var that = this;

        $timeout(function() {
          picture = data;
          DataChannelService.sendStatus(that);
        });
      };

      /**
       * Reads the representation of the local feed in order to send it to the
       * remote peers.
       *
       * @param {object} options - use the 'exclude' key to specify a list of
       *        attributes that should not be included (as array of strings)
       * @returns {object} attribute values
       */
      this.getStatus = function(options) {
        if (!options) { options = {}; }
        if (!options.exclude) { options.exclude = []; }

        var attrs = ["audioEnabled", "videoEnabled", "speaking", "picture"];
        var status = {};

        _.forEach(attrs, function(attr) {
          if (!_.includes(options.exclude, attr)) {
            status[attr] = that["get"+_.capitalize(attr)]();
          }
        });
        return status;
      };

      /**
       * Update local representation of the feed (used to process information
       * sent by the remote peer)
       */
      this.setStatus = function(attrs) {
        var that = this;
        $timeout(function() {
          if (speaking === true && attrs.speaking === false) {
            silentSince = Date.now();
          }
          _.forEach(attrs, function(value, attr) {
            that["set"+_.capitalize(attr)](value);
          });
        });
      };

      /**
       * Checks if the feed audio is inactive and, thus, can be hidden or
       * rendered as a stream of pictures instead of a video
       *
       * @returns {boolean}
       */
      this.isSilent = function(threshold) {
        if (!threshold) { threshold = 6000; }
        return !speaking && silentSince < (Date.now() - threshold);
      };

      /**
       * Enables or disables the video of the connection to Janus
       */
      this.setVideoSubscription = function(value) {
        this.connection.setConfig({values: {video: value}});
      };

      /**
       * Gets the status of the video flag of the connection to Janus
       *
       * @returns {boolean}
       */
      this.getVideoSubscription = function() {
        return this.connection.getConfig().video;
      };
    };
  }
})();
