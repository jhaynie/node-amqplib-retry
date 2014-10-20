(function () {
  'use strict';

  var config = require('./config'),
    Promise = require('bluebird');

  module.exports = function (channel) {
    return {
      start: function () {
        return channel.consume(config.readyQueueName, function (msg) {
          Promise.resolve()
            .then(function () {
              var targetQueueName = msg.properties.headers._targetQueue,
                properties = msg.properties.headers._originalProperties;
              return channel.sendToQueue(targetQueueName, new Buffer(msg), properties);
            })
            .then(function () {
              return channel.ack(msg);
            })
            .catch(function (err) {
              console.error('Error while trying to process message from ready queue.  err: ' + err + ', msg: ' + JSON.stringify(msg));
              channel.nack(msg);
            });
        });
      }
    };
  };
}());
