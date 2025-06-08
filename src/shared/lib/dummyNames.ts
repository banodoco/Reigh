export const dummyProjectNames = [
  "The Lord of the Onion Rings",
  "Gone with the Wind Turbine",
  "The Sound of Muzak",
  "2001: A Space Idiocy",
  "The Codfather",
  "Pulp Friction",
  "Schindler's Shopping List",
  "Forrest Gump's Shrimp Co.",
  "The Shawshank Redemption... from chores",
  "Silence of the Lambs...wool sweaters",
  "It's a Wonderful Life... insurance policy",
  "Citizen Cane... sugar",
  "Casablanca... a la carte",
  "The Wizard of Oz...empic",
  "Star Wars: A New Hope for a parking spot",
  "Raiders of the Lost Ark...ansas",
  "E.T. the Extra-Terrestrial... lawn gnome",
  "Jurassic Park...ing ticket",
  "The Matrix... revolutions per minute",
  "Goodfellas... who are just okay",
  "Apocalypse Now...ish",
  "The Lion King...-sized bed",
  "Finding Nemo... a ride home",
  "Toy Story... of my life",
  "Braveheart...burn"
];

export const getRandomDummyName = () => {
    return dummyProjectNames[Math.floor(Math.random() * dummyProjectNames.length)];
} 