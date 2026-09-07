///<reference path="node_modules/@types/node/index.d.ts"/>
///<reference path="node_modules/@types/chai/index.d.ts"/>
///<reference path="node_modules/@types/mocha/index.d.ts"/>

import {Gulpclass, Task, SequenceTask, MergedTask} from "gulpclass";

const fs = require("fs");
const gulp = require("gulp");
const del = require("del");
const shell = require("gulp-shell");
const replace = require("gulp-replace");
const rename = require("gulp-rename");
const sourcemaps = require("gulp-sourcemaps");
const ts = require("gulp-typescript");

@Gulpclass()
export class Gulpfile {

    // -------------------------------------------------------------------------
    // General tasks
    // -------------------------------------------------------------------------

    /**
     * Creates a delay and resolves after 15 seconds.
     */
    @Task()
    wait(cb: Function) {
        setTimeout(() => cb(), 15000);
    }

    /**
     * Cleans build folder.
     */
    @Task()
    clean(cb: Function) {
        return del(["./build/**"], cb);
    }

    /**
     * Runs typescript files compilation.
     */
    @Task()
    compile() {
        return gulp.src("package.json", { read: false })
            .pipe(shell(["npm run compile"]));
    }

    // -------------------------------------------------------------------------
    // Build and packaging for browser
    // -------------------------------------------------------------------------

    /**
     * Copies all source files into destination folder in a correct structure.
     */
    @Task()
    browserCopySources() {
        return gulp.src([
            "./src/**/*.ts",
            "!./src/commands/*.ts",
            "!./src/cli.ts",
            "!./src/typeorm.ts",
            "!./src/typeorm-model-shim.ts"
        ])
        .pipe(gulp.dest("./build/browser/src"));
    }

    /**
     * Copies templates for compilation
     */
    @Task()
    browserCopyTemplates() {
        return gulp.src("./src/platform/*.template")
            .pipe(rename((p: any) => { p.extname = '.ts'; }))
            .pipe(gulp.dest("./build/browser/src/platform"));
    }

    @MergedTask()
    browserCompile() {
        const tsProject = ts.createProject("tsconfig.json", {
            module: "es2015",
            "lib": ["es5", "es6", "dom"],
            typescript: require("typescript")
        });
        const tsResult = gulp.src([
            "./build/browser/src/**/*.ts",
            "./node_modules/reflect-metadata/**/*.d.ts"
        ])
            .pipe(sourcemaps.init())
            .pipe(tsProject());

        return [
            tsResult.dts.pipe(gulp.dest("./build/package/browser")),
            tsResult.js
                .pipe(sourcemaps.write(".", { sourceRoot: "", includeContent: true }))
                .pipe(gulp.dest("./build/package/browser"))
        ];
    }

    @Task()
    browserClearPackageDirectory(cb: Function) {
        return del([
            "./build/browser/**"
        ]);
    }

    // -------------------------------------------------------------------------
    // Main Packaging and Publishing tasks
    // -------------------------------------------------------------------------

    /**
     * Publishes a package to npm from ./build/package directory.
     */
    @Task()
    packagePublish() {
        return gulp.src("package.json", { read: false })
            .pipe(shell([
                "cd ./build/package && npm publish"
            ]));
    }
    
    /**
     * Packs a .tgz from ./build/package directory.
     */
    @Task()
    packagePack() {
        return gulp.src("package.json", { read: false })
            .pipe(shell([
                "cd ./build/package && npm pack && mv -f alkemio-typeorm-*.tgz .."
            ]));
    }

    /**
     * Publishes a package to npm from ./build/package directory with @next tag.
     */
    @Task()
    packagePublishNext() {
        return gulp.src("package.json", { read: false })
            .pipe(shell([
                "cd ./build/package && npm publish --tag next"
            ]));
    }

    /**
     * Copies all sources to the package directory.
     */
    @MergedTask()
    packageCompile() {
        const tsProject = ts.createProject("tsconfig.json", {
            typescript: require("typescript")
        });
        const tsResult = gulp.src([
            "./src/**/*.ts"
        ])
            .pipe(sourcemaps.init())
            .pipe(tsProject());

        return [
            tsResult.dts.pipe(gulp.dest("./build/package")),
            tsResult.js
                .pipe(sourcemaps.write(".", { sourceRoot: "", includeContent: true }))
                .pipe(gulp.dest("./build/package"))
        ];
    }

    /**
     * Copies compiled source files into the flat package directory.
     */
    @Task()
    packageMoveCompiledFiles() {
        return gulp.src("./build/compiled/src/**/*")
            .pipe(gulp.dest("./build/package"));
    }

    /**
     * Create ESM index file in the final package directory.
     */
    @Task()
    async packageCreateEsmIndex() {
        const buildDir = "./build/package";
        const cjsIndex = require(`${buildDir}/index.js`);
        const cjsKeys = Object.keys(cjsIndex).filter(key => key !== "default" && !key.startsWith("__"));

        const indexMjsContent =
            'import TypeORM from "./index.js";\n' +
            `const {\n    ${cjsKeys.join(",\n    ")}\n} = TypeORM;\n` +
            `export {\n    ${cjsKeys.join(",\n    ")}\n};\n` +
            'export default TypeORM;\n';

        fs.writeFileSync(`${buildDir}/index.mjs`, indexMjsContent, "utf8");
    }

    /**
     * Removes /// <reference from compiled sources.
     */
    @Task()
    packageReplaceReferences() {
        return gulp.src("./build/package/**/*.d.ts")
            .pipe(replace(`/// <reference types="node" />`, ""))
            .pipe(replace(`/// <reference types="chai" />`, ""))
            .pipe(gulp.dest("./build/package"));
    }

    /**
     * Moves all compiled files to the final package directory.
     */
    @Task()
    packageClearPackageDirectory(cb: Function) {
        return del([
            "build/package/src/**"
        ], cb);
    }

    /**
     * Writes the public fork metadata to the packaged package.json file.
     * The repository package.json intentionally keeps the upstream identity so
     * local development and source imports continue to use "typeorm".
     */
    @Task()
    async packagePreparePackageFile() {
        const packageFile = JSON.parse(await fs.promises.readFile("./package.json", "utf8"));

        packageFile.name = "@alkemio/typeorm";
        packageFile.version = "0.3.13-cti.1";
        packageFile.bin = Object.fromEntries(
            Object.entries(packageFile.bin).map(([name, target]: [string, string]) => [
                name,
                target.replace(/^\.\//, ""),
            ]),
        );
        packageFile.scripts.watch = "tsc -w";
        packageFile.repository = {
            type: "git",
            url: "git+https://github.com/antst/typeorm.git",
        };
        packageFile.bugs = {
            url: "https://github.com/antst/typeorm/issues",
        };
        packageFile.homepage = "https://github.com/antst/typeorm#readme";
        packageFile.publishConfig = {
            access: "public",
        };

        await fs.promises.writeFile(
            "./build/package/package.json",
            `${JSON.stringify(packageFile, undefined, 2)}\n`,
        );
    }

    /**
     * Copies README.md into the package.
     */
    @Task()
    packageCopyReadme() {
        return gulp.src("./README.md")
            .pipe(gulp.dest("./build/package"));
    }

    /**
     * Copies shims to use typeorm in different environment and conditions file into package.
     */
    @Task()
    packageCopyShims() {
        return gulp.src(["./extra/typeorm-model-shim.js", "./extra/typeorm-class-transformer-shim.js"])
            .pipe(gulp.dest("./build/package"));
    }

    /**
     * Creates a package that can be published to npm.
     */
    @SequenceTask()
    package() {
        return [
            "compile",
            "packageMoveCompiledFiles",
            "packageCreateEsmIndex",
            [
                "packageReplaceReferences",
                "packagePreparePackageFile",
                "packageCopyReadme",
            ],
        ];
    }

    /**
     * Creates a package .tgz
     */
    @SequenceTask()
    pack() {
        return ["package", "packagePack"];
    }

    /**
     * Creates a package and publishes it to npm.
     */
    @SequenceTask()
    publish() {
        return ["package", "packagePublish"];
    }

    /**
     * Creates a package and publishes it to npm with @next tag.
     */
    @SequenceTask("publish-next")
    publishNext() {
        return ["package", "packagePublishNext"];
    }

}
