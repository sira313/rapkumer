import { writable } from 'svelte/store';

export type KodeKegiatanData = {
	kodeMapel: string[];
	kodeTambahan: string[];
	kegiatanCustom: Array<{ kode: string }>;
	canManage: boolean;
	onHapusKegiatan: (kode: string) => void;
};

export const kodeKegiatanStore = writable<KodeKegiatanData | null>(null);
