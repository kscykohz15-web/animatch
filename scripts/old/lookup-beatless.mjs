const query = `
  query ($search: String) {
    Page(page: 1, perPage: 10) {
      media(search: $search, type: ANIME) {
        id
        title { native romaji english }
      }
    }
  }
`;

async function main() {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { search: "BEATLESS" } }),
  });

  const json = await res.json();
  console.log(JSON.stringify(json?.data?.Page?.media ?? [], null, 2));
}

main().catch(console.error);
