(function () {
  'use strict';

  var Promise = require('bluebird'),
    Initializer = require('./initializer'),
    Consumer = require('./ready_queue_consumer'),
    RetryLogic = require('./client_handler_wrapper');

  module.exports = function (channel, clientQueueName, failureQueueName, clientHandler, delayFunction) {
    if (!channel) {
      throw Error('\'channel\' not specified.  See documentation.');
    }
    if (!clientQueueName) {
      throw Error('\'clientQueueName\' not specified.  See documentation.');
    }
    if (!failureQueueName) {
      throw Error('\'failureQueueName\' not specified.  See documentation.');
    }
    if (!clientHandler) {
      throw Error('\'clientHandler\' not specified.  See documentation.');
    }

    Promise.promisifyAll(channel);
    clientHandler = Promise.promisify(clientHandler);

    // initializing the objects
    var initializer = new Initializer(channel, clientQueueName, failureQueueName),
      consumer = new Consumer(channel),
      retryLogic = new RetryLogic(channel, clientQueueName, failureQueueName, clientHandler, delayFunction, initializer);

    // initializing the queues, exchange and binding. Then starting the consumer
    initializer.initialize()
      .then(consumer.start);

    // returning wrapper for client handler function.
    return retryLogic;
  };
}());
