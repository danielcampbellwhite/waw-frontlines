# Game design summary
Player commands one nation in a historical campaign on a real map; time runs continuously (pause, 1/2/4/8x; 1x = 1 game hour per 2 s).
Orders only (never soldiers); combat resolves automatically each tick from strength, equipment, experience, morale, organisation, terrain,
weather, supply, entrenchment, support and surprise, using seeded RNG. Supply flows from depots/ports over roads/rail; fuel and ammo gate
armour and artillery. Control and front lines derive from unit influence and occupation. Enemy AI sees only through fog.
See TECHNICAL_ARCHITECTURE.md for implementation and the original brief for full scope.
