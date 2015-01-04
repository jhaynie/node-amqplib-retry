/*jslint indent: 2*/
/*global require:true, describe:true, it:true, before:true, after:true, beforeEach:true, afterEach:true*/
(function () {
  'use strict';

  require('should');

  var Promise = require('bluebird'),
    sinon = require('sinon'),
    amqp = require('amqplib'),
    Retry = require('../lib/index'),
    config = require('../lib/config'),
    TEST_QUEUE_NAME = 'rabbitmq-retry-test',
    FAILURE_QUEUE_NAME = 'rabbitmq-retry-test-failure',
    CONSUMER_TAG = 'CONSUMER_TAG';

  function hardcodedDelay(delay) {
    return function () {
      return delay;
    };
  }

  describe('rabbitmq-retry', function () {

    var channel;

    before(function () {
      return Promise.resolve(amqp.connect('amqp://guest:guest@localhost:5672'))
        .then(function (conn) {
          return conn.createChannel();
        })
        .then(function (ch) {
          Promise.promisifyAll(ch);
          channel = ch;
          return ch;
        })
        .tap(function (ch) {
          return Promise.all([
            ch.assertQueue(TEST_QUEUE_NAME, {durable: false}),
            ch.assertQueue(FAILURE_QUEUE_NAME, {durable: false})
          ]);
        });
    });

    beforeEach(function () {
      return Promise.resolve(channel)
        .tap(function (ch) {
          return Promise.all([
            ch.purgeQueue(TEST_QUEUE_NAME),
            ch.purgeQueue(FAILURE_QUEUE_NAME)
          ]);
        });
    });

    afterEach(function () {
      return Promise.resolve(channel)
        .tap(function (ch) {
          return Promise.all([
            ch.cancel(CONSUMER_TAG),
            ch.purgeQueue(config.delayQueueName),
            ch.purgeQueue(config.readyQueueName)
          ]);
        });
    });

    after(function () {
      return Promise.resolve(channel)
        .tap(function (ch) {
          return Promise.all([
            ch.deleteQueue(TEST_QUEUE_NAME),
            ch.deleteQueue(FAILURE_QUEUE_NAME)
          ]);
        })
        .delay(500);
    });

    function startListenerAndPushMessage(handler, delayFunction) {
      return Promise.resolve()
        .then(function () {
          var retry = new Retry(channel, TEST_QUEUE_NAME, FAILURE_QUEUE_NAME, handler, delayFunction);
          return channel.consume(TEST_QUEUE_NAME, retry, {consumerTag: CONSUMER_TAG});
        })
        .then(function () {
          return channel.sendToQueue(TEST_QUEUE_NAME, new Buffer('abc'));
        });
    }

    it('should retry a failed message multiple times', function (done) {
      var spy = sinon.spy(function () {
        if (spy.callCount < 3) {
          console.log(spy.callCount + ': error...');
          throw new Error('example error');
        }
        console.log(spy.callCount + ': no error!');
        return Promise.resolve();
      });

      startListenerAndPushMessage(spy, hardcodedDelay(200));

      setTimeout(function () {
        spy.calledThrice.should.be.eql(true);
        done();
      }, 1000);
    });

    it('a delay of -1 should send the message to the FAIL queue', function () {
      function handler() {
        throw new Error('this is an error');
      }

      return startListenerAndPushMessage(handler, hardcodedDelay(-1))
        .delay(200)
        .then(function () {
          return Promise.all([
            channel.checkQueue(TEST_QUEUE_NAME),
            channel.checkQueue(FAILURE_QUEUE_NAME)
          ]);
        })
        .then(function (ok) {
          ok[0].messageCount.should.be.eql(0);
          ok[1].messageCount.should.be.eql(1);
        });
    });

    it('must pass an options object', function () {
      /*jshint -W068 */ // disabled JSHINT warning: "Wrapping non-IIFE function literals in parens is unnecessary."
      (function () {
        return new Retry();
      }).should.throw();
    });

  });

}());

