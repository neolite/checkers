import type { World } from '@engine/world';
import { generateTerrainFeatures, TERRAIN_KIND_INDEX } from '@config/terrain';

export function stampTerrainFeatures(w: World): void {
  const features = generateTerrainFeatures();
  w.terrainFeatures = features;
  w.terrainTiles.fill(0);
  for (const feature of features) {
    const value = TERRAIN_KIND_INDEX[feature.kind];
    for (const tile of feature.tiles) {
      if (!w.navGrid.inBounds(tile.tx, tile.ty)) continue;
      w.terrainTiles[w.navGrid.idx(tile.tx, tile.ty)] = value;
      w.navGrid.setBlocked(tile.tx, tile.ty, true);
    }
  }
}
