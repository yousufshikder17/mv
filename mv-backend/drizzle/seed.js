// Go UP one level (..), then into src/config/
import { db } from '../src/config/db.js';

// Go UP one level (..), then into src/db/
import { mediaItems } from '../src/db/schema.js';

// Null rather than a hardcoded uuid: the previous value pointed at a user
// that no longer exists, so every run failed the foreign key.
const userId = null;

const movies = [
    {
        title: "The Matrix",
        type: "film",
        source: "seed",
        externalId: "The Matrix".toLowerCase().replace(/\s+/g, "-"),
        overview: "A computer hacker learns about the true nature of reality.",
        releaseYear: 1999,
        genres: ["Action", "Sci-Fi"],
        runtime: 136,
        posterUrl: "https://example.com/matrix.jpg",
        createdBy: userId,
    },
    {
        title: "Inception",
        type: "film",
        source: "seed",
        externalId: "Inception".toLowerCase().replace(/\s+/g, "-"),
        overview:
            "A thief who steals corporate secrets through dream-sharing technology.",
        releaseYear: 2010,
        genres: ["Action", "Sci-Fi", "Thriller"],
        runtime: 148,
        posterUrl: "https://example.com/inception.jpg",
        createdBy: userId,
    },
    {
        title: "The Dark Knight",
        type: "film",
        source: "seed",
        externalId: "The Dark Knight".toLowerCase().replace(/\s+/g, "-"),
        overview: "Batman faces the Joker in a battle for Gotham's soul.",
        releaseYear: 2008,
        genres: ["Action", "Crime", "Drama"],
        runtime: 152,
        posterUrl: "https://example.com/darkknight.jpg",
        createdBy: userId,
    },
    {
        title: "Pulp Fiction",
        type: "film",
        source: "seed",
        externalId: "Pulp Fiction".toLowerCase().replace(/\s+/g, "-"),
        overview: "The lives of two mob hitmen, a boxer, and others intertwine.",
        releaseYear: 1994,
        genres: ["Crime", "Drama"],
        runtime: 154,
        posterUrl: "https://example.com/pulpfiction.jpg",
        createdBy: userId,
    },
    {
        title: "Interstellar",
        type: "film",
        source: "seed",
        externalId: "Interstellar".toLowerCase().replace(/\s+/g, "-"),
        overview: "A team of explorers travel through a wormhole in space.",
        releaseYear: 2014,
        genres: ["Adventure", "Drama", "Sci-Fi"],
        runtime: 169,
        posterUrl: "https://example.com/interstellar.jpg",
        createdBy: userId,
    },
    {
        title: "The Shawshank Redemption",
        type: "film",
        source: "seed",
        externalId: "The Shawshank Redemption".toLowerCase().replace(/\s+/g, "-"),
        overview: "Two imprisoned men bond over a number of years.",
        releaseYear: 1994,
        genres: ["Drama"],
        runtime: 142,
        posterUrl: "https://example.com/shawshank.jpg",
        createdBy: userId,
    },
    {
        title: "Fight Club",
        type: "film",
        source: "seed",
        externalId: "Fight Club".toLowerCase().replace(/\s+/g, "-"),
        overview:
            "An insomniac office worker and a devil-may-care soapmaker form an underground fight club.",
        releaseYear: 1999,
        genres: ["Drama"],
        runtime: 139,
        posterUrl: "https://example.com/fightclub.jpg",
        createdBy: userId,
    },
    {
        title: "Forrest Gump",
        type: "film",
        source: "seed",
        externalId: "Forrest Gump".toLowerCase().replace(/\s+/g, "-"),
        overview:
            "The presidencies of Kennedy and Johnson unfold through the perspective of an Alabama man.",
        releaseYear: 1994,
        genres: ["Drama", "Romance"],
        runtime: 142,
        posterUrl: "https://example.com/forrestgump.jpg",
        createdBy: userId,
    },
    {
        title: "The Godfather",
        type: "film",
        source: "seed",
        externalId: "The Godfather".toLowerCase().replace(/\s+/g, "-"),
        overview:
            "The aging patriarch of an organized crime dynasty transfers control to his son.",
        releaseYear: 1972,
        genres: ["Crime", "Drama"],
        runtime: 175,
        posterUrl: "https://example.com/godfather.jpg",
        createdBy: userId,
    },
    {
        title: "Goodfellas",
        type: "film",
        source: "seed",
        externalId: "Goodfellas".toLowerCase().replace(/\s+/g, "-"),
        overview: "The story of Henry Hill and his life in the mob.",
        releaseYear: 1990,
        genres: ["Biography", "Crime", "Drama"],
        runtime: 146,
        posterUrl: "https://example.com/goodfellas.jpg",
        createdBy: userId,
    },
];

const main = async () => {
    console.log("Seeding movies...");

    try {
        // Optimization: Drizzle allows batch insertion, which is much faster than a loop
        await db.insert(mediaItems).values(movies);

        console.log(`Successfully seeded ${movies.length} movies!`);
    } catch (error) {
        console.error("Error seeding movies:", error);
        process.exit(1);
    }
};

main();
