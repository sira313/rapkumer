// Varian / jenjang sederajat — daftar institusi yang setara untuk setiap jenjang
export const jenjangPendidikanSederajat: Record<
	'sd' | 'smp' | 'sma' | 'slb' | 'pkbm' | 'srt',
	{ key: string; label: string }[]
> = {
	sd: [
		{ key: 'sd', label: 'Sekolah Dasar (SD)' },
		{ key: 'mi', label: 'Madrasah Ibtidaiyah (MI)' },
		{ key: 'srd', label: 'Sekolah Rakyat Dasar (SRD)' }
	],
	smp: [
		{ key: 'smp', label: 'Sekolah Menengah Pertama (SMP)' },
		{ key: 'mts', label: 'Madrasah Tsanawiyah (MTs)' },
		{ key: 'srmp', label: 'Sekolah Rakyat Menengah Pertama (SRMP)' }
	],
	sma: [
		{ key: 'sma', label: 'Sekolah Menengah Atas (SMA)' },
		{ key: 'smk', label: 'Sekolah Menengah Kejuruan (SMK)' },
		{ key: 'ma', label: 'Madrasah Aliyah (MA)' },
		{ key: 'mak', label: 'Madrasah Aliyah Kejuruan (MAK)' },
		{ key: 'srma', label: 'Sekolah Rakyat Menengah Atas (SRMA)' }
	],
	slb: [{ key: 'slb', label: 'Sekolah Luar Biasa (SLB)' }],
	pkbm: [{ key: 'pkbm', label: 'Pusat Kegiatan Belajar Masyarakat (PKBM)' }],
	srt: [{ key: 'srt', label: 'Sekolah Rakyat Terintegrasi (SRT)' }]
};

export const nauganOptions = [
	{ key: 'kemendikbud', label: 'Kementerian Pendidikan Dasar dan Menengah' },
	{ key: 'kemsos', label: 'Kementerian Sosial Republik Indonesia' },
	{ key: 'kemenag', label: 'Kementerian Agama Republik Indonesia' }
] as const;

export type NauganKey = (typeof nauganOptions)[number]['key'];

export const nauganLabelByKey = nauganOptions.reduce<Record<NauganKey, string>>(
	(acc, option) => {
		acc[option.key] = option.label;
		return acc;
	},
	{} as Record<NauganKey, string>
);

export const nauganHeaderByKey: Record<NauganKey, [string, string]> = {
	kemendikbud: ['KEMENTERIAN PENDIDIKAN DASAR DAN MENENGAH', 'REPUBLIK INDONESIA'],
	kemsos: ['KEMENTERIAN SOSIAL', 'REPUBLIK INDONESIA'],
	kemenag: ['KEMENTERIAN AGAMA', 'REPUBLIK INDONESIA']
};

export const jenisKelamin: Record<Murid['jenisKelamin'], string> = {
	L: 'Laki-laki',
	P: 'Perempuan'
};

export const jenisMapel: Record<MataPelajaran['jenis'], string> = {
	wajib: 'Mata Pelajaran Wajib',
	pilihan: 'Mata Pelajaran Pilihan',
	mulok: 'Muatan Lokal',
	kejuruan: 'Kejuruan',
	pemberdayaan: 'Muatan Pemberdayaan dan Keterampilan'
};

export const agamaMapelOptions = [
	{ key: 'umum', label: 'Umum', name: 'Pendidikan Agama dan Budi Pekerti' },
	{ key: 'islam', label: 'Islam', name: 'Pendidikan Agama Islam dan Budi Pekerti' },
	{ key: 'kristen', label: 'Kristen', name: 'Pendidikan Agama Kristen dan Budi Pekerti' },
	{ key: 'katolik', label: 'Katolik', name: 'Pendidikan Agama Katolik dan Budi Pekerti' },
	{ key: 'buddha', label: 'Buddha', name: 'Pendidikan Agama Buddha dan Budi Pekerti' },
	{ key: 'hindu', label: 'Hindu', name: 'Pendidikan Agama Hindu dan Budi Pekerti' },
	{ key: 'konghuchu', label: 'Konghuchu', name: 'Pendidikan Agama Konghuchu dan Budi Pekerti' }
] as const;

export type AgamaMapelKey = (typeof agamaMapelOptions)[number]['key'];

export const agamaParentOption = agamaMapelOptions[0];
export const agamaVariantOptions = agamaMapelOptions.filter((option) => option.key !== 'umum');
export const agamaParentName = agamaParentOption.name;
export const agamaVariantNames = agamaVariantOptions.map((option) => option.name);

export const agamaMapelNames = agamaMapelOptions.map((option) => option.name);

export const agamaMapelLabelByName = agamaMapelOptions.reduce<Record<string, string>>(
	(acc, option) => {
		acc[option.name] = option.label;
		return acc;
	},
	{}
);

export const agamaMapelKeyByName = agamaMapelOptions.reduce<Record<string, AgamaMapelKey>>(
	(acc, option) => {
		acc[option.name] = option.key;
		return acc;
	},
	{}
);

// PKS (Pendalaman Kitab Suci) options - follows same pattern as agama mapel
export const pksMapelOptions = [
	{ key: 'umum', label: 'Umum', name: 'Pendalaman Kitab Suci' },
	{ key: 'islam', label: 'Islam', name: 'Pendalaman Kitab Suci Islam' },
	{ key: 'kristen', label: 'Kristen', name: 'Pendalaman Kitab Suci Kristen' },
	{ key: 'katolik', label: 'Katolik', name: 'Pendalaman Kitab Suci Katolik' },
	{ key: 'buddha', label: 'Buddha', name: 'Pendalaman Kitab Suci Buddha' },
	{ key: 'hindu', label: 'Hindu', name: 'Pendalaman Kitab Suci Hindu' },
	{ key: 'konghuchu', label: 'Konghuchu', name: 'Pendalaman Kitab Suci Konghuchu' }
] as const;

export type PksMapelKey = (typeof pksMapelOptions)[number]['key'];

export const pksParentOption = pksMapelOptions[0];
export const pksVariantOptions = pksMapelOptions.filter((option) => option.key !== 'umum');
export const pksParentName = pksParentOption.name;
export const pksVariantNames = pksVariantOptions.map((option) => option.name);

export const pksMapelNames = pksMapelOptions.map((option) => option.name);

export const pksMapelLabelByName = pksMapelOptions.reduce<Record<string, string>>((acc, option) => {
	acc[option.name] = option.label;
	return acc;
}, {});

export const pksMapelKeyByName = pksMapelOptions.reduce<Record<string, PksMapelKey>>(
	(acc, option) => {
		acc[option.name] = option.key;
		return acc;
	},
	{}
);

export const profilPelajarPancasilaDimensions = [
	{
		key: 'ketakwaan',
		label: 'Keimanan dan Ketakwaan kepada Tuhan Yang Maha Esa'
	},
	{ key: 'kewargaan', label: 'Kewargaan' },
	{ key: 'penalaran-kritis', label: 'Penalaran kritis' },
	{ key: 'kreativitas', label: 'Kreativitas' },
	{ key: 'kolaborasi', label: 'Kolaborasi' },
	{ key: 'kemandirian', label: 'Kemandirian' },
	{ key: 'kesehatan', label: 'Kesehatan' },
	{ key: 'komunikasi', label: 'Komunikasi' }
] as const;

export type DimensiProfilLulusanKey = (typeof profilPelajarPancasilaDimensions)[number]['key'];

export const profilPelajarPancasilaDimensionLabelByKey = profilPelajarPancasilaDimensions.reduce<
	Record<DimensiProfilLulusanKey, string>
>(
	(acc, dim) => {
		acc[dim.key] = dim.label;
		return acc;
	},
	{} as Record<DimensiProfilLulusanKey, string>
);
