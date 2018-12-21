const should = require('should');
const helper = require('../support/spec_helper');

describe("Model.oneAsync()", function () {
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
                    name: "Jeremy Doe"
                }, {
                    id: 2,
                    name: "John Doe"
                }, {
                    id: 3,
                    name: "Jane Doe"
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

    describe("without arguments", function () {
        before(setup());

        it("should return first item in model", function () {
            return Person.oneAsync()
                .then(function (person) {
                    person.name.should.equal("Jeremy Doe");
                });
        });
    });

    describe("with order", function () {
        before(setup());

        it("should return first item in model based on order", function () {
            return Person.oneAsync("-name")
                .then(function (person) {
                    person.name.should.equal("John Doe");
                });
        });
    });

    describe("with conditions", function () {
        before(setup());

        it("should return first item in model based on conditions", function () {
            return Person.oneAsync({name: "Jane Doe"})
                .then(function (person) {
                    person.name.should.equal("Jane Doe");
                });
        });

        describe("if no match", function () {
            before(setup());

            it("should return null", function () {
                return Person.oneAsync({name: "Jack Doe"})
                    .then(function (person) {
                        should.equal(person, null);
                    });
            });
        });
    });
});
