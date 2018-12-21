const should = require('should');
const helper = require('../support/spec_helper');

describe("Model.countAsync()", function () {
    let db = null;
    const Person = null;

    const setup = function () {
        return function (done) {
            Person = db.define("person", {
                name: String
            });

            return helper.dropSync(Person, function () {
                Person.create([{
                    id: 1,
                    name: "John Doe"
                }, {
                    id: 2,
                    name: "Jane Doe"
                }, {
                    id: 3,
                    name: "John Doe"
                }], done);
            });
        };
    };

    before(function (done) {
        helper.connect(function (connection) {
            db = connection;

            return done();
        });
    });

    after(function () {
        return db.close();
    });

    describe("without conditions", function () {
        before(setup());

        it("should return all items in model", function () {
            return Person.countAsync()
                .then(function (count) {
                    should.equal(count, 3);
                });
        });
    });

    describe("with conditions", function () {
        before(setup());

        it("should return only matching items", function () {
            return Person.countAsync({name: "John Doe"})
                .then(function (count) {
                    should.equal(count, 2);
                });
        });
    });
});
