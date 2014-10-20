(function () {
  'use strict';

  var Promise = require('bluebird'),
    Initializer = require('./initializer'),
    Consumer = require('./ready_queue_consumer'),
    amqpHandlerWrapper = require('./amqp_handler_wrapper');

  module.exports = function (channel, clientQueueName, failureQueueName, amqpHandler, delayFunction) {
    if (!channel) {
      throw Error('\'channel\' not specified.  See documentation.');
    }
    if (!clientQueueName) {
      throw Error('\'clientQueueName\' not specified.  See documentation.');
    }
    if (!failureQueueName) {
      throw Error('\'failureQueueName\' not specified.  See documentation.');
    }
    if (!amqpHandler) {
      throw Error('\'amqpHandler\' not specified.  See documentation.');
    }

    amqpHandler = Promise.promisify(amqpHandler);

    // initializing the objects
    var initializer = new Initializer(channel, clientQueueName, failureQueueName),
      consumer = new Consumer(channel),
      wrapper = new amqpHandlerWrapper(channel, clientQueueName, failureQueueName, amqpHandler, delayFunction, initializer);

    // initializing the queues, exchange and binding. Then starting the consumer
    initializer.initialize()
      .then(consumer.start);

    // returning wrapper for given amqp handler function.
    return wrapper;
  };
}());
