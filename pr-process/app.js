const { Octokit } = require("@octokit/rest");
const cp = require("child_process");

// Essential settings - change these as we can't have defaults
const personalAccessToken = "token";
const reviewTeam = "@dx-sdks-approver";
const committer = {
  name: "Steve Hobbs",
  email: "steve.hobbs.mail@gmail.com"
};

// Optional tweaks - these are sensible defaults
const branch = "add-codeowners";
const gitHubUrl = "github.com"; // Change this if GitHub Enterprise
const message = "Setup the CODEOWNERS for pull request reviews";
const labelsToCreate = [
  {
    name: "needs investigation",
    color: "d4c5f9",
    description:
      "An issue that has more questions to answer or otherwise needs work to fully understand the issue"
  },
  {
    name: "feature request",
    color: "bfdadc",
    description: "A feature has been asked for or suggested by the community"
  },
  {
    name: "bug",
    color: "a13d3d",
    description: "This points to a verified bug in the code"
  },
  {
    name: "enhancement",
    color: "a2eeef",
    description:
      "An enhancement or improvement to the SDK that could not be otherwise categorized as a new feature"
  },
  {
    name: "documentation",
    color: "f5de49",
    description: "This adds, fixes or improves documentation"
  },
  {
    name: "invalid",
    color: "e4e669",
    description: "The issue or PR is spam or not relevant to this repository"
  },
  {
    name: "dependencies",
    color: "0366d6",
    description: "One or more dependencies are being bumped"
  },
  {
    name: "duplicate",
    color: "b8bcd4",
    description: "This is a duplicate of another issue or PR"
  },
  {
    name: "waiting for customer",
    color: "b34ba6",
    description:
      "This issue is waiting for a response from the issue or PR author"
  }
];

// Regular source, should not need to change
var startCommand =
  process.platform == "darwin"
    ? "open"
    : process.platform == "win32"
    ? "start"
    : "xdg-open";
var openUrl = url => cp.exec(`${startCommand} ${url}`);
var octokit = new Octokit({
  auth: personalAccessToken,
  userAgent: "PR Process Script",
  baseUrl: `https://api.${gitHubUrl}`,
  log: {
    debug: () => {},
    info: () => {},
    warn: console.warn,
    error: console.error
  },
  previews: ["symmetra-preview"]
});

async function run(owner, repo) {
  const path = ".github/CODEOWNERS";
  const content = Buffer.from(`*\t${reviewTeam}\n`).toString("base64");

  console.log("Creating labels ...");

  try {
    for (var label of labelsToCreate.map(l => ({
      owner,
      repo,
      name: l.name,
      color: l.color,
      description: l.description
    }))) {
      try {
        await octokit.issues.updateLabel({
          owner,
          repo,
          name: label.name,
          color: label.color,
          description: label.description
        });
      } catch (e) {
        if (e.status === 404) {
          await octokit.issues.createLabel({
            owner,
            repo,
            name: label.name,
            color: label.color,
            description: label.description
          });
        }
      }
    }
  } catch (e) {
    console.error(e);
    console.log("One or more labels probably existed (Go check)");
  }

  return;

  console.log("Creating Pull Request to add .github/CODEOWNERS ...");
  const repository = (await octokit.repos.get({ owner, repo })).data;
  const latest = (
    await octokit.repos.listCommits({
      owner,
      repo,
      sha: repository.default_branch,
      per_page: 1
    })
  ).data[0];
  const newBranch = (
    await octokit.git.createRef({
      owner,
      repo,
      ref: "refs/heads/" + branch,
      sha: latest.sha
    })
  ).data;
  try {
    const newFile = await octokit.repos.createFile({
      owner,
      repo,
      path,
      message,
      content,
      committer,
      author: committer,
      branch
    });
    const pr = (
      await octokit.pulls.create({
        owner,
        repo,
        title: message,
        head: branch,
        base: repository.default_branch
      })
    ).data;
    console.log(`Created PR #${pr.number}`);
    const review = (
      await octokit.pulls.createReviewRequest({
        owner,
        repo,
        pull_number: pr.number,
        team_reviewers: [reviewTeam]
      })
    ).data;
    openUrl(`https://${gitHubUrl}/${owner}/${repo}/pull/${pr.number}`);
  } catch {
    console.log("Probably already had a .github/CODEOWNERS file (Go check)");
  }
}

if (personalAccessToken === "your personal access token") {
  console.log(
    "No personal access token specified, opening browser to create one... copy it into the source!"
  );
  openUrl(`https://${gitHubUrl}/settings/tokens`);
} else {
  run(...process.argv[2].split("/"));
}
