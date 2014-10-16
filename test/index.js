(function () {
  'use strict';

  var Retry = require('../lib/index'),
    should = require('should'),
    Promise = require('bluebird'),
    TEST_QUEUE_NAME = 'rabbitmq-retry-test',
    amqp = require('amqplib'),
    connection;

  function connect() {
    if (!connection) {
      connection = amqp.connect('amqp://guest:guest@localhost:5672');
    }
    return connection;
  }

  describe('rabbitmq-retry tests', function () {
    it('should test delay', function (done) {
      var channel;
      Promise.resolve()
        .then(function () {
          return connect();
        })
        .then(function (conn) {
          return conn.createChannel();
        })
        .then(function (ch) {
          channel = ch;
          Promise.promisifyAll(channel);
          return channel.assertQueue(TEST_QUEUE_NAME, {durable: false, autoDelete: true});
        })
        .then(function () {
          return channel.checkQueue(TEST_QUEUE_NAME);
        })
        .then(function (ok) {
          should(ok.messageCount).eql(0);
        })
        .then(function () {
          return new Retry();
        })
        .tap(function (retry) {
          return retry.start();
        })
        .then(function (retry) {
          return retry.retry(JSON.stringify({content: 'abc', properties: {expiration: '60000'}}), 'rabbitmq-retry-test');
        })
        .then(function () {
          return channel.checkQueue(TEST_QUEUE_NAME);
        })
        .then(function (ok) {
          should(ok.messageCount).eql(0);
        })
        .delay(1000)
        .then(function () {
          return channel.checkQueue(TEST_QUEUE_NAME);
        })
        .then(function (ok) {
          should(ok.messageCount).eql(0);
        })
        .delay(2000)
        .then(function () {
          return channel.checkQueue(TEST_QUEUE_NAME);
        })
        .then(function (ok) {
          should(ok.messageCount).eql(1);
          return channel.deleteQueue(TEST_QUEUE_NAME);
        })
        .then(function () {
          done();
        })
        .catch(function (err) {
          done(err);
        });
    });
  });
}());