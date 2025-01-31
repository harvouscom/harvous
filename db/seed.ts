import { db, Notes } from 'astro:db';

// https://astro.build/db/seed
export default async function seed() {
	await db.insert(Notes).values([
		{
			title: 'Hello World',
			content: 'This is a test note',
			createdAt: new Date(),
			userId: '123',
		},
		{
			title: 'Hello World 2',
			content: 'This is a test note 2',
			createdAt: new Date(),
			userId: '123',
		},
		{
			title: 'Hello World 3',
			content: 'This is a test note 3',
			createdAt: new Date(),
			userId: '123',
		},
	]);
}
