window.__ModuleLoader__.load({ id: 'dsh-sideband', factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  SIDEBAND_COMMAND_NAME: () => SIDEBAND_COMMAND_NAME,
  SIDEBAND_LAST_MESSAGES: () => SIDEBAND_LAST_MESSAGES,
  apply: () => apply,
  createSidebandDecoration: () => createSidebandDecoration,
  inject: () => inject,
  isOrdinarySession: () => isOrdinarySession,
  sidebandSendLine: () => sidebandSendLine,
  sidebandSessionOptions: () => sidebandSessionOptions
});
module.exports = __toCommonJS(index_exports);
var SIDEBAND_COMMAND_NAME = "sideband";
var SIDEBAND_LAST_MESSAGES = 12;
function isOrdinarySession(sessions, summary) {
  return summary !== void 0 && summary.origin !== "subagent" && sessions.subagentAddress(summary.id) === void 0;
}
function sidebandSessionOptions(sessions, sourceSessionId) {
  const state = sessions.list.getSnapshot();
  const options = [];
  for (const id of state.ids) {
    if (id === sourceSessionId) continue;
    const summary = state.byId[id];
    if (!isOrdinarySession(sessions, summary)) continue;
    if (summary.blank) continue;
    options.push({
      id: String(summary.id),
      label: summary.displayTitle,
      detail: [
        summary.running ? "Running" : "Idle",
        String(summary.id)
      ].join(" \xB7 ")
    });
  }
  return options;
}
function sidebandSendLine(targetSessionId) {
  if (targetSessionId.length === 0 || /\s/u.test(targetSessionId)) {
    throw new Error("Sideband target Session id is invalid");
  }
  return `/sideband send session:${targetSessionId} --last ${SIDEBAND_LAST_MESSAGES} --delivery quiet`;
}
function sourceBinding(sessions, source) {
  const summary = sessions.list.getSnapshot().byId[source.sessionId];
  if (!isOrdinarySession(sessions, summary)) return void 0;
  return sessions.binding(source.sessionId);
}
function createSidebandDecoration(sessions) {
  return {
    name: SIDEBAND_COMMAND_NAME,
    available: (source) => sourceBinding(sessions, source) !== void 0,
    ui: {
      kind: "popupSelect",
      options: (source, signal) => {
        signal.throwIfAborted();
        return Promise.resolve(sidebandSessionOptions(sessions, source.sessionId));
      },
      onSelect: async (option, source) => {
        const binding = sourceBinding(sessions, source);
        if (binding === void 0) {
          throw new Error("The source Session is no longer an ordinary live Session");
        }
        const targetStillEligible = sidebandSessionOptions(sessions, source.sessionId).some((candidate) => candidate.id === option.id);
        if (!targetStillEligible) {
          throw new Error("The selected target Session is no longer available");
        }
        const result = await binding.session.command(sidebandSendLine(option.id));
        if (!result.ok) {
          throw new Error(`Sideband dispatch failed: ${result.error.code}: ${result.error.message}`);
        }
        if (!result.value.matched) {
          throw new Error("This Host does not offer the /sideband command");
        }
      }
    }
  };
}
var inject = ["commandUi", "sessions"];
function apply(ctx) {
  const commandUi = ctx.get("commandUi");
  const sessions = ctx.get("sessions");
  ctx.effect(
    () => commandUi.decorate(createSidebandDecoration(sessions)),
    "sideband: /sideband popupSelect decoration"
  );
}
return module.exports; } });
//# sourceMappingURL=client.js.map
