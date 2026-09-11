import type { OscMessage } from "../src/eos/listener.js";
import { EosListener } from "../src/eos/listener.js";

/** Feed canned /eos/out/* messages into the listener state parser (PLAN §11.3). */
export function replayOscMessages(listener: EosListener, messages: OscMessage[]): void {
  const handle = (listener as unknown as { handleMessage: (m: OscMessage) => void }).handleMessage;
  for (const message of messages) {
    handle.call(listener, message);
  }
}
