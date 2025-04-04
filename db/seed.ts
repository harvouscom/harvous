import { db, Notes } from 'astro:db';

const CAMS_TEST_ID = "user_2sPEHVtl8DNuI1tn3HKiepIEnyz";
const DEREK_NOTE = `<p>Thank you so much for trying out this notes app designed for Bible study. It's been a project I've been working on for a good amount of time.</p>

<p>The goal of Harvous is to be the digital tool and space for you and others to use for your Bible study.</p>

<p>How it began...  I was frustrated with there not being a good notes app just for my Bible study. I used Apple Notes and made a ton of highlights in the YouVersion Bible app. I needed a better app, so I sought out to design one. And with the help of my friend, Cam, we built this Bible study notes app.</p>

<p>Please if you come across anything that isn't working as it prolly should or if you have any feedback for us send it here.</p>`

// https://astro.build/db/seed
export default async function seed() {
	await db.insert(Notes).values([
		{
			title: 'Note from our founder, Derek',
			content: DEREK_NOTE,
			createdAt: new Date(),
			userId: CAMS_TEST_ID,
		},
	]);
}
