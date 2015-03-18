'use strict';

var config = require('./config'),
  BPromise = require('bluebird');

module.exports = function (channel, clientQueueName, failureQueueName) {
  return {
    initialize: function () {
      return BPromise.bind(this)
        .then(function () {
          return BPromise.all([
            channel.assertQueue(config.delayQueueName, {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': config.exchangeName,
                'x-dead-letter-routing-key': config.readyRouteKey
              }
            }),
            channel.assertQueue(config.readyQueueName, {durable: true}),
            channel.checkQueue(clientQueueName),
            channel.checkQueue(failureQueueName),
            channel.assertExchange(config.exchangeName, 'direct', {durable: true})
          ]);
        })
        .then(function () {
          return channel.bindQueue(config.readyQueueName, config.exchangeName, config.readyRouteKey);
        }).then(function () {
          this.isInitialized = true;
        });
    }
  };
};
