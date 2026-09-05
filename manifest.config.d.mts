export type ManifestTarget = 'chrome' | 'firefox';

export type BuiltManifest = {
  manifest_version: 3;
  name: string;
  version: string;
  description: string;
  icons: Record<string, string>;
  permissions: string[];
  host_permissions: string[];
  content_scripts: { matches: string[]; js: string[]; run_at: string; world?: 'MAIN' }[];
  web_accessible_resources: { resources: string[]; matches: string[] }[];
  options_ui: { page: string; open_in_tab: boolean };
  action: {
    default_popup: string;
    default_title: string;
    default_icon: Record<string, string>;
  };
  background:
    | { service_worker: string; type: 'module' }
    | { scripts: string[]; type: 'module' };
  browser_specific_settings?: { gecko: { id: string; strict_min_version: string } };
};

export declare const buildManifest: (opts: {
  target: ManifestTarget;
  version: string;
  dev?: boolean;
}) => BuiltManifest;
