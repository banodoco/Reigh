export const dummyProjectNames = [
  "Lord of the Onion Rings",
  "Gone with the Wind Turbine",
  "The Sound of Muzak",
  "2001: A Space Idiocy",
  "The Codfather",
  "Pulp Friction",
  "Schindler's Shopping List",
  "Forrest Gump's Shrimp Co.",  
  "The Lord of the Onion Rings",
  "12 Angry Penguins",
  "Citizen Cane Sugar",
  "Casablanca Cart",
  "The Wizard of Ozempic",
  "Star Wars: New Hope Parking",
  "Raiders of Lost Arkansas",
  "E.T. the Extra Lawn Gnome",
  "Jurassic Parking Ticket",
  "The Matrix Revolutions",
  "Okayfellas",
  "Apocalypse Nowish",
  "The Lion King-Sized Bed",
  "Finding Nemo a Ride Home",
  "The Princess Diarrhea",
  "Braveheart Burn"
];

export const getRandomDummyName = () => {
    return dummyProjectNames[Math.floor(Math.random() * dummyProjectNames.length)];
} 