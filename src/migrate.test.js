import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeNgModule,
  findStandaloneCandidates,
  buildMigrationPrompt,
} from "./migrate.js";

const APP_MODULE = `
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { UsersComponent } from './users/users.component';
import { HighlightPipe } from './pipes/highlight.pipe';

@NgModule({
  declarations: [
    AppComponent,
    UsersComponent,
    HighlightPipe
  ],
  imports: [BrowserModule],
  exports: [],
  bootstrap: [AppComponent]
})
export class AppModule {}
`;

const EMPTY_MODULE = `
@NgModule({ declarations: [], imports: [] })
export class EmptyModule {}
`;

test("analyzeNgModule extracts arrays from a realistic AppModule", () => {
  const mods = analyzeNgModule(APP_MODULE);
  assert.equal(mods.length, 1);
  const m = mods[0];
  assert.equal(m.name, "AppModule");
  assert.deepEqual(m.declarations, ["AppComponent", "UsersComponent", "HighlightPipe"]);
  assert.deepEqual(m.imports, ["BrowserModule"]);
  assert.deepEqual(m.exports, []);
  assert.deepEqual(m.bootstrap, ["AppComponent"]);
});

test("analyzeNgModule handles empty declarations and invalid input", () => {
  const m = analyzeNgModule(EMPTY_MODULE);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0].declarations, []);
  assert.deepEqual(analyzeNgModule(""), []);
  assert.deepEqual(analyzeNgModule(null), []);
  assert.deepEqual(analyzeNgModule(42), []);
});

test("findStandaloneCandidates flags non-standalone declarations", () => {
  const decls = ["UsersComponent", "HighlightPipe", "AlreadyStandalone"];
  const sources = {
    UsersComponent: "@Component({ selector: 'app-users', templateUrl: '...' })",
    HighlightPipe: "@Pipe({ name: 'highlight' })",
    AlreadyStandalone: "@Component({ standalone: true, selector: 'x' })",
  };
  const cands = findStandaloneCandidates(decls, sources);
  assert.deepEqual(cands, ["UsersComponent", "HighlightPipe", "AlreadyStandalone"].filter((d) => d !== "AlreadyStandalone"));
  assert.deepEqual(findStandaloneCandidates([], sources), []);
  assert.deepEqual(findStandaloneCandidates(undefined), []);
});

test("buildMigrationPrompt contains module info and validates input", () => {
  const m = analyzeNgModule(APP_MODULE)[0];
  const msgs = buildMigrationPrompt(m);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, "system");
  assert.match(msgs[1].content, /AppModule/);
  assert.match(msgs[1].content, /UsersComponent/);
  assert.match(msgs[1].content, /bootstrapApplication/);
  assert.throws(() => buildMigrationPrompt(null), TypeError);
  assert.throws(() => buildMigrationPrompt("nope"), TypeError);
});
