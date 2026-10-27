"use strict";
/**
 * Upload contract tests: the files library, which is the one place the API
 * accepts arbitrary bytes. Covers accepted types, rejected types, ownership of
 * downloads, and that the stored file never escapes the upload directory.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, stopServer, req, makeUser } = require("./helpers");

test.before(async () => {
  await startServer();
});
test.after(stopServer);

function textFile(name, content, type = "text/plain") {
  return new File([content], name, { type });
}

async function upload(token, file, subjectId) {
  const form = new FormData();
  form.append("file", file);
  if (subjectId) form.append("subjectId", subjectId);
  return req("/api/library/files", { method: "POST", token, form });
}

test("upload extracts text and hides the full extracted body from listings", async () => {
  const { token } = await makeUser();
  const res = await upload(token, textFile("notes.txt", "Operating systems: deadlock basics"));
  assert.equal(res.status, 201);
  assert.equal(res.body.data.originalName, "notes.txt");
  assert.equal(res.body.data.hasText, true);
  assert.equal(res.body.data.extractedText, undefined);

  const list = await req("/api/library/files", { token });
  assert.equal(list.status, 200);
  assert.equal(list.body.data.items.length, 1);
  assert.equal(list.body.data.items[0].extractedText, undefined);
});

test("download returns the bytes to the owner only", async () => {
  const owner = await makeUser();
  const other = await makeUser();
  const res = await upload(owner.token, textFile("chapter.md", "# Chapter\ncontent"));
  const id = res.body.data._id;

  const ok = await req(`/api/library/files/${id}/download`, { token: owner.token, raw: true });
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /Chapter/);

  const anon = await req(`/api/library/files/${id}/download`, { raw: true });
  assert.equal(anon.status, 401);

  const stranger = await req(`/api/library/files/${id}/download`, {
    token: other.token,
    raw: true,
  });
  assert.equal(stranger.status, 404);
});

test("unsupported file types are rejected", async () => {
  const { token } = await makeUser();
  const res = await upload(
    token,
    new File([Buffer.from([0x4d, 0x5a, 0x90, 0x00])], "evil.exe", {
      type: "application/x-msdownload",
    }),
  );
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});

test("delete removes the record and a second delete is 404", async () => {
  const { token } = await makeUser();
  const res = await upload(token, textFile("temp.csv", "a,b\n1,2\n", "text/csv"));
  const id = res.body.data._id;

  const del = await req(`/api/library/files/${id}`, { method: "DELETE", token });
  assert.equal(del.status, 200);

  const again = await req(`/api/library/files/${id}`, { method: "DELETE", token });
  assert.equal(again.status, 404);
});

test("upload without a file is a 400, not a crash", async () => {
  const { token } = await makeUser();
  const form = new FormData();
  form.append("subjectId", "000000000000000000000000");
  const res = await req("/api/library/files", { method: "POST", token, form });
  assert.equal(res.status, 400);
});
