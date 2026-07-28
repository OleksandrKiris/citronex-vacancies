from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "assets" / "housing"
OUTPUT_ROOT = ROOT / "assets" / "housing-thumbs"
MAX_SIZE = (480, 320)


def main() -> None:
    created = 0
    source_bytes = 0
    output_bytes = 0

    for source in sorted(SOURCE_ROOT.rglob("*.webp")):
        relative = source.relative_to(SOURCE_ROOT)
        output = OUTPUT_ROOT / relative
        output.parent.mkdir(parents=True, exist_ok=True)

        with Image.open(source) as image:
            prepared = ImageOps.exif_transpose(image).convert("RGB")
            prepared.thumbnail(MAX_SIZE, Image.Resampling.LANCZOS)
            prepared.save(output, "WEBP", quality=68, method=6, optimize=True)

        created += 1
        source_bytes += source.stat().st_size
        output_bytes += output.stat().st_size

    print(
        f"Housing thumbnails: {created}; "
        f"{source_bytes} -> {output_bytes} bytes "
        f"({output_bytes / source_bytes:.1%})."
    )


if __name__ == "__main__":
    main()
