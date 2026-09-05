import { createContext, useContext } from 'react';
import type { AssetResolver } from '../timeline/theme/types.js';

/**
 * アセットの URL の作り方は環境で違う。
 *   拡張     chrome.runtime.getURL('assets/' + ref)
 *   ハーネス new URL('../../assets/' + ref, import.meta.url).href
 */
const AssetContext = createContext<AssetResolver>((ref) => ref);

export const AssetProvider = AssetContext.Provider;

export const useAsset = (): AssetResolver => useContext(AssetContext);
