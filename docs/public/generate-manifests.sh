#!/bin/bash

# Script to generate manifest.json files for models, textures, and sound folders

PUBLIC_DIR="../public"

# Generate models manifest
echo "Generating models manifest..."
MODELS=$(find "$PUBLIC_DIR/models" -type f \( -iname "*.glb" -o -iname "*.fbx" \) | sed "s|$PUBLIC_DIR||" | sed 's/^/  "/' | sed 's/$/",/' | sed '$ s/,$//')
echo "[" > "$PUBLIC_DIR/models/manifest.json"
echo "$MODELS" >> "$PUBLIC_DIR/models/manifest.json"
echo "]" >> "$PUBLIC_DIR/models/manifest.json"
echo "✓ Created $PUBLIC_DIR/models/manifest.json"

# Generate textures manifest
echo "Generating textures manifest..."
TEXTURES=$(find "$PUBLIC_DIR/textures" -type f \( -iname "*.jpg" -o -iname "*.png" \) | sed "s|$PUBLIC_DIR||" | sed 's/^/  "/' | sed 's/$/",/' | sed '$ s/,$//')
echo "[" > "$PUBLIC_DIR/textures/manifest.json"
echo "$TEXTURES" >> "$PUBLIC_DIR/textures/manifest.json"
echo "]" >> "$PUBLIC_DIR/textures/manifest.json"
echo "✓ Created $PUBLIC_DIR/textures/manifest.json"

# Generate sound manifest
echo "Generating sound manifest..."
SOUNDS=$(find "$PUBLIC_DIR/sound" -type f \( -iname "*.mp3" -o -iname "*.wav" \) 2>/dev/null | sed "s|$PUBLIC_DIR||" | sed 's/^/  "/' | sed 's/$/",/' | sed '$ s/,$//')
if [ -z "$SOUNDS" ]; then
  echo "[]" > "$PUBLIC_DIR/sound/manifest.json"
else
  echo "[" > "$PUBLIC_DIR/sound/manifest.json"
  echo "$SOUNDS" >> "$PUBLIC_DIR/sound/manifest.json"
  echo "]" >> "$PUBLIC_DIR/sound/manifest.json"
fi
echo "✓ Created $PUBLIC_DIR/sound/manifest.json"

# Generate prefabs manifest
echo "Generating prefabs manifest..."
if [ -d "$PUBLIC_DIR/prefabs" ]; then
  PREFABS=$(find "$PUBLIC_DIR/prefabs" -type f -iname "*.json" ! -name "manifest.json" | sed "s|$PUBLIC_DIR||" | sed 's/^/  "/' | sed 's/$/",/' | sed '$ s/,$//')
  if [ -z "$PREFABS" ]; then
    echo "[]" > "$PUBLIC_DIR/prefabs/manifest.json"
  else
    echo "[" > "$PUBLIC_DIR/prefabs/manifest.json"
    echo "$PREFABS" >> "$PUBLIC_DIR/prefabs/manifest.json"
    echo "]" >> "$PUBLIC_DIR/prefabs/manifest.json"
  fi
else
  mkdir -p "$PUBLIC_DIR/prefabs"
  echo "[]" > "$PUBLIC_DIR/prefabs/manifest.json"
fi
echo "✓ Created $PUBLIC_DIR/prefabs/manifest.json"

echo ""
echo "All manifests generated successfully!"
