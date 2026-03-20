declare module 'murmurhash3js-revisited' {
  interface X86 {
    hash32(key: string, seed?: number): number;
    hash128(key: string, seed?: number): string;
  }

  interface X64 {
    hash128(key: string, seed?: number): string;
  }

  interface MurmurHash3 {
    x86: X86;
    x64: X64;
  }

  const murmurhash3: MurmurHash3;
  export default murmurhash3;
}
