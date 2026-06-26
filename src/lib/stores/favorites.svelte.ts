export type Favorite = {
	id: number;
	userId: number;
	path: string;
	title: string;
	createdAt: string;
	updatedAt: string | null;
};

class FavoritesStore {
	items = $state<Favorite[]>([]);
}
export const favoritesStore = new FavoritesStore();
