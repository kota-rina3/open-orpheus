class MockTextDecoder {
  decode() {
    return "";
  }
}
globalThis.TextDecoder = MockTextDecoder as unknown as typeof TextDecoder;
