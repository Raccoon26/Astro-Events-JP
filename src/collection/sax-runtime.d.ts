interface Tag {
  local: string;
  uri: string;
  attributes: Record<string, { local: string; value: string }>;
}
interface Events {
  error: Error;
  doctype: string;
  opentag: Tag;
  closetag: Tag;
  text: string;
  cdata: string;
}
interface Sax {
  on<K extends keyof Events>(name: K, handler: (event: Events[K]) => void): Sax;
  write(text: string): Sax;
  close(): Sax;
}
export function createSax(): Sax;
