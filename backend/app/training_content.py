"""Built-in course material and question bank (English). Seeded as each course's reading and first quiz, and used by
Demo AI Mode to "generate" quizzes offline. Live AI can generate quizzes in any of the four app languages.

Questions: (kind, prompt, options, index of the correct option, explanation). Kinds: mcq, true_false, scenario.
"""
Q = tuple[str, str, list[str], int, str]

COURSES: dict[str, tuple[str, list[Q]]] = {
    "Fire Safety Essentials": (
        """## Why fires start at work
Fire needs heat, fuel and oxygen. Take one away and the fire goes out. Most workplace fires start from electrical faults, hot work such as welding, smoking, and rubbish or oily rags left near heat.

## Prevent
- Keep walkways, exits and fire doors clear at all times.
- Store flammable liquids in the marked cabinet and close the lids.
- Report damaged cables and overloaded sockets straight away.

## If you discover a fire
1. Raise the alarm: shout "Fire!" and press the nearest call point.
2. Leave by the nearest safe exit. Don't use lifts and don't stop for belongings.
3. Go to your assembly point and report to the fire marshal.
Only fight a fire if it is small, you are trained, and your way out is behind you.

## Extinguishers
Water for paper, wood and cloth. CO2 for electrical equipment. Foam or powder for flammable liquids. Never use water on electrical or oil fires.""",
        [("mcq", "What three things does a fire need?", ["Heat, fuel and oxygen", "Heat, water and air", "Fuel, smoke and wind", "Sparks, metal and gas"], 0,
          "Remove any one of heat, fuel or oxygen and the fire goes out."),
         ("mcq", "Which extinguisher is right for a burning electrical panel?", ["Water", "CO2", "Foam", "Wet cloth"], 1,
          "CO2 doesn't conduct electricity and leaves no residue. Water conducts electricity."),
         ("true_false", "You should use the lift to leave the building faster during a fire.", ["True", "False"], 1,
          "Lifts can stop or fill with smoke. Always use the stairs."),
         ("scenario", "You find a small bin fire. Your exit is behind you and you are trained. What first?",
          ["Fight it right away", "Raise the alarm, then use the right extinguisher", "Walk away quietly", "Throw water from a bucket"], 1,
          "Always raise the alarm first so others can get out, even if you then tackle a small fire."),
         ("mcq", "Where should oily rags go?", ["In a covered metal bin", "On the workbench", "In a cardboard box", "In your pocket"], 0,
          "Oily rags can self-heat and ignite. A lidded metal bin stops oxygen getting in.")]),
    "Basic Workplace First Aid": (
        """## Your role
You are not expected to treat injuries unless you are a trained first aider. Your job is to keep yourself safe, get help fast and give simple care while you wait.

## DR ABC
- Danger: make sure the area is safe for you before you go near.
- Response: talk to the person and gently tap their shoulders.
- Airway, Breathing, Circulation: check they are breathing normally.

## Get help
Call the first aider and your site emergency number. Say exactly where you are and what happened.

## Simple care while you wait
- Bleeding: press firmly on the wound with a clean pad.
- Burns: cool under running water for 20 minutes. Don't use ice or creams.
- Don't move someone who may have a back or neck injury unless they are in danger.""",
        [("mcq", "What does the first D in DR ABC stand for?", ["Doctor", "Danger", "Drink", "Distance"], 1,
          "Check for danger first. You can't help anyone if you get hurt too."),
         ("mcq", "How long should a burn be cooled under running water?", ["1 minute", "5 minutes", "20 minutes", "Until it stops hurting, max 10 seconds"], 2,
          "20 minutes of cool running water reduces damage. Ice can make it worse."),
         ("true_false", "You should put butter or cream on a burn.", ["True", "False"], 1, "Only cool water. Creams trap heat and can cause infection."),
         ("scenario", "A colleague has a deep cut and is bleeding a lot. What do you do while help comes?",
          ["Give them water", "Press firmly on the wound with a clean pad", "Wash it with soap", "Let it bleed to clean it"], 1,
          "Firm direct pressure is the most effective way to slow bleeding."),
         ("mcq", "Someone fell from a ladder and complains of neck pain. What should you do?",
          ["Help them stand up", "Keep them still and get help", "Move them to a chair", "Give them a painkiller"], 1,
          "Moving someone with a possible spine injury can make it much worse.")]),
    "Choosing and Wearing PPE": (
        """## PPE is the last line of defence
Personal protective equipment protects you only when the hazard can't be removed or controlled another way. It must fit, be right for the task and be in good condition.

## Before every shift
- Check for cracks, tears, worn soles and broken straps.
- Make sure it's within its replacement date.
- Report anything damaged or missing: don't work without it.

## Fit matters
A helmet must be adjusted to your head. Gloves must match the task: cut-resistant for blades, chemical-resistant for solvents, heat-rated for hot parts. Ear plugs must be rolled and inserted fully.""",
        [("mcq", "Where does PPE sit in the hierarchy of controls?", ["First choice", "Last line of defence", "Not part of it", "Same as engineering controls"], 1,
          "Elimination, substitution, engineering and procedures come first; PPE protects only the person wearing it."),
         ("true_false", "If your gloves are torn you can keep using them until the end of the shift.", ["True", "False"], 1,
          "Damaged PPE may not protect you. Report it and get a replacement."),
         ("mcq", "Which gloves are right for handling solvents?", ["Cotton gloves", "Chemical-resistant gloves", "Leather welding gloves", "No gloves"], 1,
          "Only chemical-resistant gloves stop solvents reaching your skin."),
         ("scenario", "Your helmet has a crack. What do you do?", ["Tape it", "Keep wearing it", "Report it and get a new one before work", "Wear it backwards"], 2,
          "A cracked helmet may fail under impact."),
         ("mcq", "How should ear plugs be worn?", ["Just at the entrance of the ear", "Rolled and inserted fully", "Around the neck", "Only in one ear"], 1,
          "Plugs only reduce noise when fully inserted and sealed.")]),
    "Machine Guarding and Lockout": (
        """## Guards
Guards stop body parts reaching moving machinery. Never remove or bypass a guard. If a guard is missing or damaged, stop and report it.

## Lockout-tagout (LOTO)
Before cleaning, clearing a jam or maintenance:
1. Stop the machine using normal controls.
2. Isolate every energy source: electrical, pneumatic, hydraulic, stored energy.
3. Apply your own lock and tag. Only you remove your lock.
4. Try to start the machine to prove it's isolated.""",
        [("mcq", "What is the first step before clearing a jam?", ["Reach in quickly", "Stop the machine and isolate it", "Ask a colleague to watch", "Remove the guard"], 1,
          "Moving parts can restart. Stop and isolate first."),
         ("true_false", "Anyone can remove your lockout lock if they need the machine.", ["True", "False"], 1,
          "Only the person who applied a lock removes it."),
         ("mcq", "Why do you try to start the machine after locking out?", ["To test the motor", "To prove it is isolated", "To clear the jam", "It's not needed"], 1,
          "Testing proves no energy remains before you put your hands in."),
         ("scenario", "A guard is missing on a conveyor you must use. What do you do?", ["Work carefully", "Stop and report it", "Wear gloves", "Work faster"], 1,
          "Never run a machine without its guard."),
         ("mcq", "Which energy can remain after the power is off?", ["None", "Stored pressure or springs", "Only electricity", "Only heat"], 1,
          "Hydraulic, pneumatic and spring energy can remain and must be released.")]),
    "Electrical Hazard Awareness": (
        """## Electricity can kill
Electric shock, burns and fires come from damaged cables, wet conditions and unqualified work.

## Do
- Check plugs and cables before use; report damage.
- Keep liquids away from electrical equipment.
- Report tripping breakers, burning smells or sparks.

## Don't
- Don't open panels or repair electrical equipment unless you are authorised.
- Don't touch someone who is being electrocuted: switch off the power first.""",
        [("mcq", "Someone is being electrocuted. What first?", ["Pull them away", "Switch off the power", "Throw water", "Call them loudly"], 1,
          "Touching them can electrocute you too. Isolate the power first."),
         ("true_false", "You can repair a damaged plug yourself if you're careful.", ["True", "False"], 1, "Only authorised people repair electrical equipment."),
         ("mcq", "Which is a warning sign?", ["A warm cup of tea", "A burning smell near a socket", "A quiet machine", "A tidy desk"], 1,
          "A burning smell can mean overheating wires: report it at once."),
         ("scenario", "A cable is cut but the machine still works. What do you do?", ["Keep using it", "Tape it", "Stop using it and report it", "Wrap it in cloth"], 2,
          "Damaged insulation exposes live conductors."),
         ("mcq", "Why keep liquids away from equipment?", ["They are heavy", "They conduct electricity", "They smell", "No reason"], 1,
          "Water conducts electricity and can cause shocks and short circuits.")]),
    "Handling Hazardous Chemicals": (
        """## Know what you use
Read the label and the safety data sheet (SDS) before using a chemical. The pictograms show the main dangers.

## Use safely
- Wear the gloves and eye protection the SDS asks for.
- Work where there's good ventilation.
- Never mix chemicals unless the procedure says so.
- Keep containers closed and labelled.

## Spills
Leave the area if fumes are strong. Use the spill kit only if trained. Report every spill.""",
        [("mcq", "Where do you find a chemical's PPE requirements?", ["On a poster", "In the safety data sheet", "Ask a friend", "Smell it"], 1,
          "The SDS lists hazards, PPE and first aid for that chemical."),
         ("true_false", "Mixing two cleaners makes them stronger and safer.", ["True", "False"], 1, "Mixing can release toxic gases."),
         ("mcq", "A container has no label. What do you do?", ["Guess what it is", "Don't use it and report it", "Smell it", "Pour it away"], 1,
          "Unknown chemicals can't be handled safely."),
         ("scenario", "A drum leaks and the fumes make you dizzy. What first?", ["Clean it up", "Leave the area and raise the alarm", "Open a window and stay", "Cover it with cloth"], 1,
          "Get to fresh air first; trained people handle the spill."),
         ("mcq", "Why keep containers closed?", ["To look tidy", "To stop vapours and spills", "To keep them cold", "No reason"], 1,
          "Closed containers stop vapour build-up and spills.")]),
    "Safe Lifting and Posture": (
        """## Before you lift
Can a trolley, lift assist or second person help? Test the weight first. Plan your route and clear it.

## Lift
- Feet apart, one slightly forward.
- Bend your knees, keep your back straight.
- Hold the load close to your waist.
- Turn with your feet, never twist your back.

## Over 25 kg
Don't lift it alone. Use equipment or a team lift.""",
        [("mcq", "Where should you hold a load?", ["At arm's length", "Close to your waist", "Above your head", "On one shoulder"], 1,
          "Close to the body reduces the strain on your back."),
         ("true_false", "Twisting your back while lifting is fine if the load is light.", ["True", "False"], 1, "Turn with your feet; twisting strains the spine."),
         ("mcq", "What's the safe approach for a 30 kg sack?", ["Lift it quickly", "Use a trolley, lift assist or team lift", "Drag it", "Lift with your back"], 1,
          "Loads over 25 kg should not be lifted alone."),
         ("scenario", "Your route to the shelf is blocked by boxes. What first?", ["Step over them carrying the load", "Clear the route before lifting", "Lift higher", "Throw the load"], 1,
          "Plan and clear the route before you pick anything up."),
         ("mcq", "Which body part should do the work?", ["Your back", "Your legs", "Your arms only", "Your neck"], 1, "Leg muscles are stronger; bend your knees.")]),
    "Evacuation and Emergency Response": (
        """## Know before it happens
Learn your nearest two exits, your assembly point and who your fire marshal is.

## When the alarm sounds
1. Stop work and make your machine safe if it takes seconds.
2. Leave by the nearest safe exit, calmly.
3. Help visitors and anyone who needs it.
4. Go to the assembly point and report to the marshal. Don't go back inside until told.

## In this app
Use Emergency mode or the siren button: it alarms everyone and starts a roll call. Answer "I'm safe" so nobody searches for you.""",
        [("mcq", "What do you do first when the evacuation alarm sounds?", ["Finish your task", "Stop work and leave by the nearest safe exit", "Collect your bag", "Call home"], 1,
          "Leave straight away; seconds matter."),
         ("true_false", "You can go back in for your phone once you've reported at the assembly point.", ["True", "False"], 1,
          "Never re-enter until the marshal says it's safe."),
         ("mcq", "Why answer 'I'm safe' in the app's roll call?", ["To earn points", "So nobody risks searching for you", "It's optional", "To stop the siren for everyone"], 1,
          "Rescuers look for anyone unaccounted for."),
         ("scenario", "Your nearest exit is blocked by smoke. What do you do?", ["Go through quickly", "Use your second exit", "Wait at your desk", "Use the lift"], 1,
          "That's why you learn two exits."),
         ("mcq", "Who do you report to at the assembly point?", ["Anyone", "The fire marshal", "Security at the gate", "Nobody"], 1,
          "The marshal checks everyone is out.")]),
}


def bank_questions(title: str) -> list[Q]:
    return COURSES.get(title, ("", []))[1]
