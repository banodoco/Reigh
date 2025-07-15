export const dummyProjectNames = [
  "Lord of the Onion Rings",
  "Gone with the Wind Turbine",      
  "Pulp Friction",
  "Schindler's Shopping List",  
  "12 Angry Penguins",    
  "The Wizard of Ozempic",    
  "Jurassic Parking Ticket",  
  "Okayfellas",
  "Apocalypse Nowish",  
  "The Lion Kink",
  "The Princess Diarrhea",
  "Braveheart Burn"
];

export const getRandomDummyName = () => {
    return dummyProjectNames[Math.floor(Math.random() * dummyProjectNames.length)];
} 