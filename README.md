# AnatomyAngular

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 18.2.21.

## Developer documentation

Run `npm start`, then open `/docs` for the developer portal or `/anatomy` for the viewer.
The portal includes architecture, dental algorithms, generated API declarations, source browsing,
search, and seven type-checked integration scenarios. Both features are lazy-loaded independently.

See [documentation maintenance](docs/DEVELOPER_DOCUMENTATION.md) for editing and validation,
and [implementation and verification results](docs/PORTAL_REPORT.md) for this change.

```sh
node scripts/generate-docs-api.mjs
node scripts/check-docs.mjs
npx tsc --noEmit -p docs/tsconfig.examples.json
```

With the development server running, `node scripts/browser-smoke.mjs` checks the viewer and
`node scripts/docs-browser-smoke.mjs` checks the documentation. Both accept `CHROME_BIN` and
`ANATOMY_URL`; the existing viewer script requires Angular development/debug APIs.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
