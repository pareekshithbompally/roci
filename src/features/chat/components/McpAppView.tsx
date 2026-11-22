/** An MCP App: the screen an MCP tool declared (`_meta.ui.resourceUri`), shown in the reply where the tool ran. Rust serves
 *  it on an origin of its own with the CSP it declared; the official AppBridge speaks the protocol (input, result, size,
 *  theme), and answers what the screen asks (its server's tools, links, messages). If the screen can't open (server gone, no HTML), nothing shows: the tool's row still has its output. */

import React, { useEffect, useRef, useState } from 'react';
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { CallToolResult } from '@modelcontextprotocol/client';
import { mcpService, type OpenedMcpApp } from '@services/mcp.service';
import { getTauriEnvironment, openUrl } from '@services/tauri';
import { callToolFromScreen } from '@extensions/tools';
import { confirm } from '@shared/stores/confirmStore';
import { useSettings } from '@shared/contexts/SettingsContext';
import { chatToolPreferences } from '@config/chatTools.config';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { cssToken } from '@shared/utils/cssToken';
import { Surface } from '@shared/ui';
import { APP_CONFIG } from '@config/app.config';
import { MCP_APP_CONFIG } from '@config/mcp.config';
import type { McpAppMeta } from '@extensions/tools/types';

const failed = (what: string) => (error: unknown) => console.error(`[McpAppView] ${what}:`, error);

/** Roci's look as the spec's host context: light or dark, and the tokens under the spec's variable names. */
function hostContext(isDark: boolean): McpUiHostContext {
  const variables = Object.fromEntries(
    Object.entries(MCP_APP_CONFIG.styleVariables).map(([name, token]) => [name, cssToken(token)]),
  );
  const sizes = Object.entries(MCP_APP_CONFIG.textSizes).map(([step, token]) => [`--font-text-${step}-size`, cssToken(token)]);
  const font = { ...Object.fromEntries(sizes), '--font-sans': getComputedStyle(document.body).fontFamily };
  return {
    theme: isDark ? 'dark' : 'light',
    displayMode: 'inline',
    availableDisplayModes: ['inline'],
    locale: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    styles: { variables: { ...variables, ...font } as NonNullable<McpUiHostContext['styles']>['variables'] },
  };
}

/** The screen's own origin, opened for as long as the view shows it. A lifecycle (Rust keeps the HTML under a token until
 *  closed), not cached data, so it is an effect rather than a query. */
function useScreen(server: string, uri: string): OpenedMcpApp | null {
  const [screen, setScreen] = useState<OpenedMcpApp | null>(null);
  useEffect(() => {
    let token: string | null = null;
    let gone = false;
    mcpService
      .openApp(server, uri)
      .then((opened) => {
        token = opened.token;
        if (gone) mcpService.closeApp(opened.token).catch(failed('Closing the screen failed'));
        else setScreen(opened);
      })
      .catch(failed(`Opening ${uri} failed`));
    return () => {
      gone = true;
      if (token) mcpService.closeApp(token).catch(failed('Closing the screen failed'));
    };
  }, [server, uri]);
  return screen;
}

/** What the screen may ask of Roci, answered with the chat's current state (read when it asks). */
interface ScreenHost {
  server: string;
  disabledTools: ReadonlySet<string>;
  /** Sends text as the user's message in this chat; absent where the chat can't take one. */
  onSend?: (text: string) => void;
}

/** A link the screen asks to open: web links only, and only once the user agrees. */
async function openLinkFromScreen(server: string, url: string): Promise<{ isError?: boolean }> {
  if (!/^https?:\/\//i.test(url)) return { isError: true };
  const agreed = await confirm({ title: MCP_APP_CONFIG.copy.openLinkTitle(server), description: url, confirmLabel: MCP_APP_CONFIG.copy.openLink });
  if (!agreed) return { isError: true };
  await openUrl(url);
  return {};
}

/** The screen's requests: a tool on its own server (through the approval prompt), a link (confirmed), a message (sent as
 *  the user's, as if typed). */
function answerRequests(bridge: AppBridge, host: React.RefObject<ScreenHost>): void {
  bridge.oncalltool = async ({ name, arguments: args }) =>
    (await callToolFromScreen(host.current.server, name, args ?? {}, host.current.disabledTools)) as CallToolResult;
  bridge.onopenlink = ({ url }) => openLinkFromScreen(host.current.server, url);
  bridge.onmessage = async ({ content }) => {
    const text = content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n').trim();
    const send = host.current.onSend;
    if (!text || !send) return { isError: true };
    send(text);
    return {};
  };
}

/** Connects the frame once it loads: the handshake, then the call's input and result; the screen reports its height and
 *  may call its server's tools, open links and send messages. */
function useBridge(frame: React.RefObject<HTMLIFrameElement | null>, app: McpAppMeta, isDark: boolean, onHeight: (h: number) => void, host: React.RefObject<ScreenHost>) {
  const bridgeRef = useRef<AppBridge | null>(null);

  const connect = async () => {
    const view = frame.current?.contentWindow;
    if (!view) return;
    const { version } = await getTauriEnvironment();
    const capabilities = { logging: {}, openLinks: {}, serverTools: {}, message: { text: {} } };
    const bridge = new AppBridge(null, { name: APP_CONFIG.name, version: version ?? '' }, capabilities, { hostContext: hostContext(isDark) });
    answerRequests(bridge, host);
    bridge.onsizechange = ({ height }) => {
      if (height) onHeight(Math.min(height, MCP_APP_CONFIG.maxHeight));
    };
    bridge.onloggingmessage = (message) => console.info('[McpAppView] screen log:', message);
    bridge.oninitialized = () => {
      bridge.sendToolInput({ arguments: app.input }).catch(failed('Sending the input failed'));
      bridge.sendToolResult(app.result as CallToolResult).catch(failed('Sending the result failed'));
    };
    await bridge.connect(new PostMessageTransport(view, view));
    bridgeRef.current = bridge;
  };

  // Light/dark changes reach a screen already showing.
  useEffect(() => {
    const bridge = bridgeRef.current;
    if (bridge) Promise.resolve(bridge.sendHostContextChange(hostContext(isDark))).catch(failed('Sending the theme failed'));
  }, [isDark]);

  // React has already removed the frame when this runs, so there is no screen left to answer `ui/resource-teardown`
  // (asking would only time out): the connection just closes.
  useEffect(() => () => {
    bridgeRef.current?.close().catch(failed('Closing failed'));
  }, []);

  return () => void connect().catch(failed('Connecting to the screen failed'));
}

interface McpAppViewProps {
  app: McpAppMeta;
  title: string;
  /** Sends a message the screen asks to send, as the user's. */
  onSend?: (text: string) => void;
}

export const McpAppView: React.FC<McpAppViewProps> = ({ app, title, onSend }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { isDark } = useThemeContext();
  const { settings } = useSettings();
  const [height, setHeight] = useState<number>(MCP_APP_CONFIG.initialHeight);
  const host = useRef<ScreenHost>({ server: app.server, disabledTools: new Set(), onSend });
  host.current = { server: app.server, disabledTools: new Set(chatToolPreferences(settings).disabledMcpTools), onSend };
  const screen = useScreen(app.server, app.resourceUri);
  const onLoad = useBridge(frameRef, app, isDark, setHeight, host);

  if (!screen) return null;
  return (
    <Surface variant={screen.meta?.prefersBorder === false ? 'plain' : 'card'} radius="lg" className="my-2 w-full overflow-hidden">
      <iframe
        ref={frameRef}
        src={screen.url}
        title={title}
        sandbox={MCP_APP_CONFIG.sandbox}
        onLoad={onLoad}
        className="block w-full"
        style={{ height }}
      />
    </Surface>
  );
};
