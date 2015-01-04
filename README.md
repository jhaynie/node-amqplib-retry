# `amqplib-retry`

Retry failed attempts to consume a message, with increasing delays between each attempt.

[![NPM](https://nodei.co/npm/amqplib-retry.png?downloads=true&stars=true)](https://nodei.co/npm/amqplib-retry/)

[![Build Status](https://travis-ci.org/lanetix/node-amqplib-retry.svg)](https://travis-ci.org/lanetix/node-amqplib-retry)

## Installation (via [npm](https://npmjs.org/package/amqplib-retry))

```bash
$ npm install amqplib-retry --save
```

## Usage

```javascript
(function () {
  'use strict';

  var Promise = require('bluebird'),
    amqp = require('amqplib'),
    retry = require('amqplib-retry'),
    CONSUMER_QUEUE = 'example-queue',
    FAILURE_QUEUE = 'example-queue.failure';

  Promise.resolve(amqp.connect('amqp://localhost:5672'))
    .then(function (conn) {
      return conn.createChannel();
    })
    .tap(function (channel) {
      return Promise.all([
        channel.assertQueue(CONSUMER_QUEUE, {durable: false, autoDelete: true}),
        channel.assertQueue(FAILURE_QUEUE, {durable: false, autoDelete: true})
      ]);
    })
    .tap(function (channel) {
      var messageHandler = function (msg) {
        // no need to 'ack' or 'nack' messages
        // messages that generate an exception (or a rejected promise) will be retried
        console.log(msg);
      };

      channel.consume(CONSUMER_QUEUE, retry({
        channel: channel,
        consumerQueue: CONSUMER_QUEUE,
        failureQueue: FAILURE_QUEUE,
        handler: messageHandler
        //delay: function (attempts) { return 1000; /* milliseconds */ }
      }));
    });

}());

```

## License

[MIT License](http://www.opensource.org/licenses/mit-license.php)

## Author

[Lanetix](https://github.com/lanetix) ([engineering@lanetix.com](mailto:engineering@lanetix.com))


