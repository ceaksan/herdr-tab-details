import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, terminals, focused, props, theme, closeOverlay } from "herdr";

const unavailable = "Not reported by Herdr";

export function describeTab(tabId, allSpaces, allPanes, allTerminals) {
  const space = allSpaces.find((s) => s.tabs.some((t) => t.id === tabId));
  const tab = space?.tabs.find((t) => t.id === tabId);
  if (!tab) return { error: "Tab closed or disconnected. Reopen Tab details." };
  const rows = [
    ["Machine", space.machine || "This computer"],
    ["Space", space.name],
    ["Space ID", space.id],
    ["Tab", tab.name],
    ["Tab ID", tab.id],
  ];
  const tabPanes = allPanes.filter((p) => p.tab === tabId);
  for (const [index, pane] of tabPanes.entries()) {
    const terminal = allTerminals.find((t) => t.address === pane.terminal);
    rows.push([`Pane ${index + 1}`, pane.pane]);
    if (!pane.terminal) {
      rows.push(["Mod", pane.mod || pane.title]);
      continue;
    }
    rows.push(
      ["Terminal address", pane.terminal],
      ["Title", pane.title || unavailable],
      ["Directory", pane.cwd || terminal?.foreground?.cwd || terminal?.cwd || unavailable],
      ["Program", pane.program?.name || terminal?.foreground?.name || unavailable],
      ["Agent", pane.app || terminal?.report?.app || unavailable],
      ["Status", pane.status || terminal?.state || unavailable],
      ["Agent report", terminal?.report ? JSON.stringify(terminal.report) : unavailable],
      ["Inspect", `hc get ${shellQuote(pane.terminal)} --json`],
      ["Read screen", `hc read ${shellQuote(pane.terminal)} --lines 50`],
    );
  }
  return { rows, text: rows.map(([label, value]) => `${label}: ${value}`).join("\n") };
}

function shellQuote(value) {
  return /^[a-zA-Z0-9_./-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

export default class TabInfo extends View {
  init(_props, cx) {
    this.tab = props()?.tab || focused()?.tab;
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.copied = false;
  }

  details() {
    return describeTab(this.tab, spaces(), panes(), terminals());
  }

  copy(cx) {
    const details = this.details();
    if (details.error) return;
    cx.write_to_clipboard(details.text);
    this.copied = true;
    cx.notify();
  }

  render() {
    const t = theme();
    const details = this.details();
    const button = (id, label, action) => div().id(id).px(12).py(8).rounded(6)
      .bg(t.raised).hover((s) => s.bg(t.hover)).cursor_pointer()
      .on_click((_e, cx) => action(cx)).child(label);
    return v_flex().id("herdr-info").track_focus(this.handle).size_full().p(22).gap(16)
      .bg(t.popover).text_color(t.foreground).text_size(13)
      .on_key_down((e) => { if (e.key === "escape") closeOverlay(props().overlay); })
      .child(h_flex().items_center().gap(12)
        .child(div().flex_1().text_size(19).font_semibold().child("Tab details"))
        .when(!details.error, (el) => el.child(button("copy-tab-info", this.copied ? "Copied" : "Copy details", (cx) => this.copy(cx))))
        .child(button("close-tab-info", "Close", () => closeOverlay(props().overlay))))
      .child(div().text_color(t.muted).child("Use the terminal address to reach this tab through Herdr. Agent chat session IDs are separate and may not be reported."))
      .child(v_flex().id("tab-info-rows").flex_1().min_h(0).gap(10).overflow_y_scrollbar()
        .children(details.error ? [div().child(details.error)] : details.rows.map(([label, value], index) =>
          v_flex().id(`info-${index}`).gap(3).pb(8).border_b_1().border_color(t.border)
            .child(div().text_size(11).text_color(t.muted).child(label))
            .child(div().child(String(value))))));
  }
}
