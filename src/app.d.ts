// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		type DashboardStatistik = {
			rombel: {
				total: number;
				perFase: Array<{ fase: string | null; label: string; jumlah: number }>;
			};
			murid: {
				total: number;
			};
		};
		// interface Error {}
		interface Locals {
			sekolah?: Omit<Sekolah, 'logo'>;
			sekolahDirty?: boolean;
			user?: Pick<
				AuthUser,
				'id' | 'username' | 'permissions' | 'type' | 'kelasId' | 'pegawaiId' | 'mataPelajaranId'
			>;
			session?: (Pick<AuthSession, 'id' | 'expiresAt'> & { tokenHash?: string }) | undefined;
			requestIsSecure?: boolean;
		}
		type PiagamRankingOption = {
			muridId: number;
			peringkat: number;
			nama: string;
			nilaiRataRata: number | null;
		};
		interface PageData {
			meta: PageMeta;
			sekolah?: Omit<Sekolah, 'logo'>;
			daftarKelas?: Array<
				Pick<Kelas, 'id' | 'nama' | 'fase'> & { waliKelas?: Pick<Pegawai, 'id' | 'nama'> | null }
			>;
			kelasAktif?:
				| (Pick<Kelas, 'id' | 'nama' | 'fase'> & {
						waliKelas?: Pick<Pegawai, 'id' | 'nama'> | null;
				  })
				| null;
			statistikDashboard?: DashboardStatistik;
			coverData?: CoverPrintData;
			biodataData?: BiodataPrintData;
			raporData?: RaporPrintData;
			piagamData?: PiagamPrintData;
			keasramaanData?: KeasramaanPrintData;
			piagamRankingOptions?: PiagamRankingOption[];
			user?: Pick<
				AuthUser,
				'id' | 'username' | 'permissions' | 'type' | 'kelasId' | 'pegawaiId' | 'mataPelajaranId'
			>;
		}
		interface PageState {
			modal: {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				data: any;
				name: string;
			};
		}
		// interface Platform {}
	}
}

export {};
