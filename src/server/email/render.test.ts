import { describe, expect, it } from "vitest";
import { renderTemplate, textToHtml, unknownVariables, usesVariable } from "./render";

describe("renderTemplate", () => {
  it("fills variables, tolerating spaces inside the braces", () => {
    expect(renderTemplate("Hi {{name}}, see {{ link }}", { name: "Ana", link: "https://x" })).toBe("Hi Ana, see https://x");
  });
  it("renders a missing variable as empty rather than leaking the placeholder", () => {
    expect(renderTemplate("Hi {{name}}!", {})).toBe("Hi !");
  });
});

describe("unknownVariables / usesVariable", () => {
  it("reports variables outside the allowed list, once each", () => {
    expect(unknownVariables("{{name}} {{nmae}} {{nmae}}", ["name", "link"])).toEqual(["nmae"]);
  });
  it("detects whether a required variable is present", () => {
    expect(usesVariable("Click {{link}}", "link")).toBe(true);
    expect(usesVariable("Click here", "link")).toBe(false);
  });
});

describe("textToHtml", () => {
  it("escapes markup so template or trader text cannot inject HTML", () => {
    expect(textToHtml("<script>x</script>")).toBe("<p>&lt;script&gt;x&lt;/script&gt;</p>");
  });
  it("makes paragraphs and links", () => {
    expect(textToHtml("One\n\nGo to https://a.test/x")).toBe('<p>One</p>\n<p>Go to <a href="https://a.test/x">https://a.test/x</a></p>');
  });
});
