import { SaxesParser, type SaxesTagPlain } from "saxes";

export type PunchOutCredential = { domain: string; identity: string };
export type PunchOutSetupRequest = {
  payloadId: string;
  timestamp: string;
  version: string | null;
  from: PunchOutCredential;
  to: PunchOutCredential;
  sender: PunchOutCredential & { sharedSecret: string };
  operation: string;
  buyerCookie: string;
  browserFormPost: string;
};
type XmlNode = { name: string; attributes: Record<string, string>; text: string; children: XmlNode[] };

export class PunchOutCxmlError extends Error {
  constructor(message: string) { super(message); this.name = "PunchOutCxmlError"; }
}

function localName(name: string) {
  const pieces = name.split(":");
  return pieces[pieces.length - 1];
}
function attributes(tag: SaxesTagPlain) {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(tag.attributes)) result[localName(name)] = String(value);
  return result;
}
function oneChild(node: XmlNode, name: string) {
  const found = node.children.filter((child) => child.name === name);
  if (found.length !== 1) throw new PunchOutCxmlError("Expected exactly one " + name + " element.");
  return found[0];
}
function nodeText(node: XmlNode, label: string) {
  const value = node.text.trim();
  if (!value) throw new PunchOutCxmlError(label + " is required.");
  return value;
}
function credential(parent: XmlNode, label: string) {
  const node = oneChild(parent, "Credential");
  const domain = node.attributes.domain?.trim() || "";
  if (!domain) throw new PunchOutCxmlError(label + " credential domain is required.");
  return { domain, identity: nodeText(oneChild(node, "Identity"), label + " identity"), node };
}

export function parsePunchOutSetupRequest(xml: string, maxBodyBytes = 262144): PunchOutSetupRequest {
  if (!xml.trim()) throw new PunchOutCxmlError("cXML request body is empty.");
  if (Buffer.byteLength(xml, "utf8") > maxBodyBytes) throw new PunchOutCxmlError("cXML request body is too large.");

  const roots: XmlNode[] = [];
  const stack: XmlNode[] = [];
  let nodeCount = 0;
  const parser = new SaxesParser({ xmlns: false });

  parser.on("doctype", (doctype) => {
    if (doctype.includes("[") || /<!ENTITY/i.test(doctype)) {
      throw new PunchOutCxmlError("Internal DTD/entity declarations are not accepted.");
    }
  });
  parser.on("opentag", (tag) => {
    nodeCount += 1;
    if (nodeCount > 512) throw new PunchOutCxmlError("cXML document contains too many elements.");
    if (stack.length >= 32) throw new PunchOutCxmlError("cXML document is too deeply nested.");
    const node: XmlNode = { name: localName(tag.name), attributes: attributes(tag), text: "", children: [] };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node); else roots.push(node);
    stack.push(node);
  });
  const appendText = (value: string) => { const current = stack[stack.length - 1]; if (current) current.text += value; };
  parser.on("text", appendText);
  parser.on("cdata", appendText);
  parser.on("closetag", () => { stack.pop(); });

  try { parser.write(xml).close(); }
  catch (error) {
    if (error instanceof PunchOutCxmlError) throw error;
    throw new PunchOutCxmlError("Malformed cXML request.");
  }

  if (roots.length !== 1 || roots[0].name !== "cXML") throw new PunchOutCxmlError("Expected one cXML document root.");
  const root = roots[0];
  const header = oneChild(root, "Header");
  const setup = oneChild(oneChild(root, "Request"), "PunchOutSetupRequest");
  const from = credential(oneChild(header, "From"), "From");
  const to = credential(oneChild(header, "To"), "To");
  const sender = credential(oneChild(header, "Sender"), "Sender");
  const payloadId = root.attributes.payloadID?.trim() || "";
  const timestamp = root.attributes.timestamp?.trim() || "";
  if (!payloadId) throw new PunchOutCxmlError("cXML payloadID is required.");
  if (!timestamp) throw new PunchOutCxmlError("cXML timestamp is required.");

  return {
    payloadId,
    timestamp,
    version: root.attributes.version?.trim() || null,
    from: { domain: from.domain, identity: from.identity },
    to: { domain: to.domain, identity: to.identity },
    sender: {
      domain: sender.domain,
      identity: sender.identity,
      sharedSecret: nodeText(oneChild(sender.node, "SharedSecret"), "Sender SharedSecret"),
    },
    operation: setup.attributes.operation?.trim() || "",
    buyerCookie: nodeText(oneChild(setup, "BuyerCookie"), "BuyerCookie"),
    browserFormPost: nodeText(oneChild(oneChild(setup, "BrowserFormPost"), "URL"), "BrowserFormPost URL"),
  };
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function buildPunchOutSetupResponse(input: {
  payloadId: string;
  timestamp: string;
  startPageUrl: string;
  version?: string | null;
}) {
  const version = input.version ? " version=\"" + escapeXml(input.version) + "\"" : "";
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<cXML payloadID=\"" + escapeXml(input.payloadId) + "\" timestamp=\"" + escapeXml(input.timestamp) + "\"" + version + ">",
    "<Response><Status code=\"200\" text=\"OK\">OK</Status><PunchOutSetupResponse><StartPage><URL>",
    escapeXml(input.startPageUrl),
    "</URL></StartPage></PunchOutSetupResponse></Response></cXML>",
  ].join("");
}
