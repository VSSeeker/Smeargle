export type CardImageKind = "cards" | "foils";

type ParseCardImageKindsOptions = {
  args: string[];
  command: string;
};

const allCardImageKinds: CardImageKind[] = ["cards", "foils"];

export function parseCardImageKinds({
  args,
  command,
}: ParseCardImageKindsOptions): CardImageKind[] {
  const selectedKinds = new Set<CardImageKind>();

  for (const arg of args) {
    if (arg === "--") continue;

    if (arg === "--help" || arg === "-h") {
      console.log(formatCardImageKindUsage(command));
      process.exit(0);
    }

    const kind = parseCardImageKindArg(arg);
    if (!kind) {
      console.error(`Unknown card image selector: ${arg}\n`);
      console.error(formatCardImageKindUsage(command));
      process.exit(1);
    }

    selectedKinds.add(kind);
  }

  if (selectedKinds.size === 0) return [...allCardImageKinds];

  return allCardImageKinds.filter((kind) => selectedKinds.has(kind));
}

function parseCardImageKindArg(arg: string): CardImageKind | undefined {
  switch (arg) {
    case "--cards":
    case "--card":
    case "cards":
    case "card":
      return "cards";
    case "--foils":
    case "--foil":
    case "foils":
    case "foil":
      return "foils";
    default:
      return undefined;
  }
}

function formatCardImageKindUsage(command: string): string {
  return [
    `Usage: ${command} [--cards] [--foils]`,
    "",
    "Options:",
    "  --cards  Process regular card images only",
    "  --foils  Process foil images only",
    "  -h, --help  Show this help",
    "",
    "With no selector, both regular card images and foils are processed.",
    "Passing both selectors also processes both.",
  ].join("\n");
}
