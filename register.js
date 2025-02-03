import fetch from "node-fetch";
import { config } from "dotenv";
config();

const url = `https://discord.com/api/v10/applications/${process.env.CLIENT_ID}/role-connections/metadata`;
// supported types: number_lt=1, number_gt=2, number_eq=3, number_neq=4, datetime_lt=5, datetime_gt=6, boolean_eq=7, boolean_neq=8
const body = [
    {
        key: "exp_level",
        name: "EXP reached.",
        description: "You must reach this amount of EXP to claim this role.",
        type: 2,
    },
];

const response = await fetch(url, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${process.env.CLIENT_TOKEN}`,
    },
});
if (response.ok) {
    const data = await response.json();
    console.log("Metadata registered successfully:", data);
} else {
    const data = await response.text();
    console.log("Error registering metadata:", data);
}
