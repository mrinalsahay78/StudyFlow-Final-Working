"use strict";
/**
 * Editable starter templates for common engineering subjects.
 *
 * These are deliberately generic: they are offered as a starting point the
 * student can rename, edit, extend or ignore, because every college follows a
 * slightly different syllabus. Nothing here is applied automatically.
 */

const STARTER_SUBJECTS = [
  {
    id: "dsa",
    name: "Data Structures & Algorithms",
    code: "DSA",
    color: "#6c5ce7",
    targetHours: 60,
    notes:
      "Common CSE/core subject. Adjust unit names to match your university scheme.",
    units: [
      {
        title: "Unit 1 — Foundations",
        topics: [
          "Time & space complexity",
          "Asymptotic notation",
          "Recursion and recurrence relations",
          "Arrays and strings",
        ],
      },
      {
        title: "Unit 2 — Linear structures",
        topics: ["Stacks", "Queues and deques", "Linked lists", "Applications of stacks/queues"],
      },
      {
        title: "Unit 3 — Trees",
        topics: ["Binary trees & traversals", "BST", "Heaps & priority queues", "AVL / balanced trees"],
      },
      {
        title: "Unit 4 — Graphs",
        topics: ["Representations", "BFS & DFS", "Shortest paths", "Minimum spanning trees"],
      },
      {
        title: "Unit 5 — Algorithms",
        topics: ["Sorting", "Greedy", "Divide and conquer", "Dynamic programming"],
      },
    ],
  },
  {
    id: "dbms",
    name: "Database Management Systems",
    code: "DBMS",
    color: "#00b894",
    targetHours: 45,
    units: [
      {
        title: "Unit 1 — Introduction",
        topics: ["DBMS architecture", "ER modelling", "Relational model", "Keys & constraints"],
      },
      {
        title: "Unit 2 — SQL",
        topics: ["DDL / DML", "Joins", "Subqueries", "Views, triggers, procedures"],
      },
      {
        title: "Unit 3 — Normalisation",
        topics: ["Functional dependencies", "1NF–BCNF", "Decomposition", "Denormalisation trade-offs"],
      },
      {
        title: "Unit 4 — Transactions",
        topics: ["ACID", "Concurrency control", "Locking & 2PL", "Recovery"],
      },
      {
        title: "Unit 5 — Storage & indexing",
        topics: ["B+ trees", "Hashing", "Query optimisation", "NoSQL overview"],
      },
    ],
  },
  {
    id: "os",
    name: "Operating Systems",
    code: "OS",
    color: "#0984e3",
    targetHours: 45,
    units: [
      {
        title: "Unit 1 — Processes",
        topics: ["Process states", "PCB & context switching", "Threads", "Scheduling algorithms"],
      },
      {
        title: "Unit 2 — Synchronisation",
        topics: ["Critical section", "Semaphores & mutexes", "Classic problems", "Deadlocks"],
      },
      {
        title: "Unit 3 — Memory",
        topics: ["Paging", "Segmentation", "Virtual memory", "Page replacement"],
      },
      {
        title: "Unit 4 — File systems & I/O",
        topics: ["File allocation", "Directory structures", "Disk scheduling", "I/O buffering"],
      },
    ],
  },
  {
    id: "cn",
    name: "Computer Networks",
    code: "CN",
    color: "#e17055",
    targetHours: 45,
    units: [
      {
        title: "Unit 1 — Fundamentals",
        topics: ["OSI & TCP/IP models", "Topologies", "Transmission media", "Switching"],
      },
      {
        title: "Unit 2 — Data link layer",
        topics: ["Framing", "Error detection", "MAC & Ethernet", "Flow control"],
      },
      {
        title: "Unit 3 — Network layer",
        topics: ["IPv4/IPv6 addressing", "Subnetting", "Routing algorithms", "ICMP"],
      },
      {
        title: "Unit 4 — Transport & application",
        topics: ["TCP vs UDP", "Congestion control", "DNS, HTTP, SMTP", "Network security basics"],
      },
    ],
  },
  {
    id: "oop",
    name: "Object Oriented Programming",
    code: "OOP",
    color: "#fd79a8",
    targetHours: 40,
    units: [
      {
        title: "Unit 1 — Core concepts",
        topics: ["Classes & objects", "Constructors/destructors", "Encapsulation", "Access modifiers"],
      },
      {
        title: "Unit 2 — Inheritance & polymorphism",
        topics: ["Types of inheritance", "Virtual functions", "Overloading vs overriding", "Abstract classes"],
      },
      {
        title: "Unit 3 — Advanced",
        topics: ["Templates & generics", "Exception handling", "File I/O", "STL / collections"],
      },
    ],
  },
  {
    id: "maths3",
    name: "Engineering Mathematics III",
    code: "M3",
    color: "#fdcb6e",
    targetHours: 40,
    units: [
      {
        title: "Unit 1 — Linear algebra",
        topics: ["Matrices & rank", "Eigenvalues/eigenvectors", "Systems of equations", "Diagonalisation"],
      },
      {
        title: "Unit 2 — Transforms",
        topics: ["Laplace transforms", "Inverse Laplace", "Fourier series", "Z-transforms"],
      },
      {
        title: "Unit 3 — Numerical methods",
        topics: ["Root finding", "Interpolation", "Numerical integration", "ODE solvers"],
      },
    ],
  },
  {
    id: "coa",
    name: "Computer Organization & Architecture",
    code: "COA",
    color: "#a29bfe",
    targetHours: 40,
    units: [
      {
        title: "Unit 1 — Basics",
        topics: ["Number systems", "Instruction formats", "Addressing modes", "CPU organisation"],
      },
      {
        title: "Unit 2 — Memory & I/O",
        topics: ["Cache memory", "Memory hierarchy", "I/O techniques", "DMA"],
      },
      {
        title: "Unit 3 — Pipelining",
        topics: ["Pipeline hazards", "Instruction-level parallelism", "RISC vs CISC", "Multicore basics"],
      },
    ],
  },
  {
    id: "se",
    name: "Software Engineering",
    code: "SE",
    color: "#00cec9",
    targetHours: 35,
    units: [
      {
        title: "Unit 1 — Process",
        topics: ["SDLC models", "Agile & Scrum", "Requirement engineering", "Feasibility study"],
      },
      {
        title: "Unit 2 — Design",
        topics: ["Modularity & cohesion", "UML diagrams", "Design patterns", "Architecture styles"],
      },
      {
        title: "Unit 3 — Quality",
        topics: ["Testing levels & types", "Test case design", "Software metrics", "Maintenance"],
      },
    ],
  },
];

module.exports = { STARTER_SUBJECTS };
