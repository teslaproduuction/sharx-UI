// Standalone module marker — these are SOURCE files grafted into the sing-box
// build (see Dockerfile singbox-fetch stage), NOT part of the SharX module.
// The nested go.mod makes `go build ./...` skip this directory so the enfein /
// sing-box imports here don't need to resolve against SharX's go.mod.
module github.com/konstpic/sharx-singbox-mieru-graft

go 1.26
