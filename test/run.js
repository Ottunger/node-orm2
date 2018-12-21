const chalk = require("chalk");
const Mocha = require("mocha");
const glob = require("glob");
const path = require("path");
const common = require("./common");
const logging = require("./logging");

const location = path.normalize(path.join(__dirname, "integration", "**", "*.js"));
const mocha = new Mocha({
    reporter: "progress",
    timeout: 15000
});

switch (common.hasConfig(common.protocol())) {
    case 'not-defined':
        logging.error("There's no configuration for protocol **%s**", common.protocol());
        process.exit(0);
    case 'not-found':
        logging.error("**test/config.js** missing. Take a look at **test/config.example.js**");
        process.exit(0);
}

runTests();

function runTests() {
    if (common.protocol() === 'mongodb' && common.nodeVersion().major > 6) {
        console.warn(chalk.red("MongoDB 1.x doesn't work with node 7, 8 or newer."));
        console.warn(chalk.red("Tests will not run."));
        console.warn(chalk.red("If you would like this to work, please submit a pull request."));
        return;
    }

    glob.sync(location).forEach(function (file) {
        if (!shouldRunTest(file)) return;
        mocha.addFile(file);
    });

    logging.info("Testing **%s**", common.getConnectionString());

    mocha.run(function (failures) {
        process.exit(failures);
    });
}

function shouldRunTest(file) {
    const name = path.basename(file).slice(0, -3);
    const proto = common.protocol();
    const exclude = ['model-aggregate', 'property-number-size', 'smart-types'];

    if (proto === "mongodb" && exclude.indexOf(name) >= 0) return false;

    return true;
}

