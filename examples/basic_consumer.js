var Promise = require('bluebird')
var amqplib = require('amqplib')
var retry = require('amqplib-retry')
var CONSUMER_QUEUE = 'example-queue'
var FAILURE_QUEUE = 'example-queue.failure'

Promise
  .resolve(amqplib.connect('amqp://localhost:5672'))
  .then(function (conn) {
    return conn.createChannel()
  })
  .tap(function (channel) {
    return Promise.all([
      channel.assertQueue(CONSUMER_QUEUE, { durable: false, autoDelete: true }),
      channel.assertQueue(FAILURE_QUEUE, { durable: false, autoDelete: true })
    ])
  })
  .tap(function (channel) {
    var messageHandler = function (msg) {
      // no need to 'ack' or 'nack' messages
      // messages that generate an exception (or a rejected Promise) will be retried
      console.log(msg)
    }

    channel.consume(CONSUMER_QUEUE, retry({
      channel: channel,
      consumerQueue: CONSUMER_QUEUE,
      failureQueue: FAILURE_QUEUE,
      handler: messageHandler
      //  delay: function (attempts) { return 1000; /* milliseconds */ }
    }))
  })
