# `amqplib-retry`

[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)
[![NPM Version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]
[![Dependencies][dependencies-image]][dependencies-url]
[![DevDependencies][dependencies-dev-image]][dependencies-dev-url]

Retry failed attempts to consume a message, with increasing delays between each attempt.


## Installation (via [npm](https://npmjs.org/package/amqplib-retry))

```bash
$ npm install amqplib-retry --save
```

## Usage

```javascript
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
```

## Parameters

__channel__ (required): Amqplib channel. See: [connection.createChannel()](http://www.squaremobius.net/amqp.node/channel_api.html#model_createChannel)  
__consumerQueue__ (required): Name of the queue that holds the amqp messages that need to be processed.  
__delay__ (optional): Delay in milliseconds between retries.  Default: `Math.pow(2, <# of attempts>)`  
__failureQueue__ (optional):  Name of the queue that holds the amqp messages that could not be processed in spite of the retries.  Default: `<consumerQueue>.failure`  
__handler__ (required): Set up a consumer with a callback to be invoked with each message.  

## License

[MIT License](http://www.opensource.org/licenses/mit-license.php)

## Author

[Lanetix](https://github.com/lanetix) ([engineering@lanetix.com](mailto:engineering@lanetix.com))

[npm-image]: https://img.shields.io/npm/v/amqplib-retry.svg?style=flat-square
[npm-url]: https://npmjs.org/package/amqplib-retry
[travis-image]: http://img.shields.io/travis/lanetix/node-amqplib-retry.svg?style=flat-square
[travis-url]: https://travis-ci.org/lanetix/node-amqplib-retry
[coveralls-image]: http://img.shields.io/coveralls/lanetix/node-amqplib-retry.svg?style=flat-square
[coveralls-url]: https://coveralls.io/r/lanetix/node-amqplib-retry
[dependencies-image]: https://david-dm.org/lanetix/node-amqplib-retry/status.svg
[dependencies-url]: https://david-dm.org/lanetix/node-amqplib-retry
[dependencies-dev-image]: https://david-dm.org/lanetix/node-amqplib-retry/dev-status.svg
[dependencies-dev-url]: https://david-dm.org/lanetix/node-amqplib-retry?type=dev
