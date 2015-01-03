(function () {
  'use strict';

  var Promise = require('bluebird'),
    Initializer = require('./initializer'),
    Consumer = require('./ready_queue_consumer'),
    AmqpHandlerWrapper = require('./amqp_handler_wrapper');

  module.exports = function (channel, clientQueueName, failureQueueName, amqpHandler, delayFunction) {
    if (!channel) {
      throw new Error('\'channel\' not specified.  See documentation.');
    }
    if (!clientQueueName) {
      throw new Error('\'clientQueueName\' not specified.  See documentation.');
    }
    if (!failureQueueName) {
      throw new Error('\'failureQueueName\' not specified.  See documentation.');
    }
    if (!amqpHandler) {
      throw new Error('\'amqpHandler\' not specified.  See documentation.');
    }

    amqpHandler = Promise.promisify(amqpHandler);

    // initializing the objects
    var initializer = new Initializer(channel, clientQueueName, failureQueueName),
      consumer = new Consumer(channel),
      wrapper = new AmqpHandlerWrapper(channel, clientQueueName, failureQueueName, amqpHandler, delayFunction, initializer);

    // initializing the queues, exchange and binding. Then starting the consumer
    initializer.initialize()
      .then(consumer.start);

    // returning wrapper for given amqp handler function.
    return wrapper;
  };

}());

