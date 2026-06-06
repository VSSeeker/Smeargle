export function parseImageUrlKey(key: string): string[] {
  if (key.startsWith("PKT/")) {
    const pocketRef = key.slice(4);
    const separator = pocketRef.indexOf("#");
    if (separator <= 0 || separator === pocketRef.length - 1) {
      throw new Error(`Invalid Pocket image key: ${key}`);
    }

    return ["PKT", pocketRef.slice(0, separator), pocketRef.slice(separator + 1)];
  }

  const separator = key.indexOf("#");
  if (separator <= 0 || separator === key.length - 1) {
    throw new Error(`Invalid physical image key: ${key}`);
  }

  return [key.slice(0, separator), key.slice(separator + 1)];
}

export function getSetCodeFromImageUrlKey(key: string) {
  const [first, second] = parseImageUrlKey(key);
  return first === "PKT" && second ? `${first}/${second}` : first;
}

export function formatImageUrlKey(pathParts: readonly string[]) {
  if (pathParts[0] === "PKT") {
    if (pathParts.length !== 3) {
      throw new Error(`Invalid Pocket cache path: ${pathParts.join("/")}`);
    }
    return `PKT/${pathParts[1]}#${pathParts[2]}`;
  }

  if (pathParts.length !== 2) {
    throw new Error(`Invalid physical cache path: ${pathParts.join("/")}`);
  }
  return `${pathParts[0]}#${pathParts[1]}`;
}
