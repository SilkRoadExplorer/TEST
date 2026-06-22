/* ============================================================
   The Shire Guide - Knowledge Challenge
   A multi-question gate before a new journey section.

   Flow (matches our system flowchart):
   - The Fellowship answers every question, one at a time.
   - No feedback is shown during the round.
   - After the last question, the whole round is graded at once:
       a full review, with a cryptic hint on each wrong answer.
   - All correct      -> section unlocked.
   - Not all correct  -> the whole round can be retried.
   - A "try" is one COMPLETE run; up to data-max-attempts tries.
   - Previous answers stay selected on a retry.
   - After the last try fails -> marked unprepared (warning).

   CONTENT NOTE:
   Questions live in the HTML (#quiz-data) as data attributes, not
   in this file. To add or edit a question, copy a .quiz-question
   block in interface.html - no JavaScript changes are needed.
   This module only reads that markup and drives the interaction.
   ============================================================ */

/* ---- Read question content from the HTML --------------------------------- */
/* Each .quiz-question carries its prompt and hint as data attributes, and
   holds its answers as child elements with data-correct. We turn that markup
   into a plain data structure so the rest of the logic stays declarative. */
function readQuestionsFromDom() {
  const questionEls = document.querySelectorAll("#quiz-data [data-question]");

  return Array.from(questionEls).map((questionEl, questionNumber) => {
    const optionEls = questionEl.querySelectorAll("[data-option]");

    const answers = Array.from(optionEls).map((optionEl) => ({
      label: optionEl.textContent.trim(),
      correct: optionEl.dataset.correct === "true",
    }));

    const prompt = questionEl.dataset.prompt || "(missing question text)";
    // Fall back to an empty string so the review never prints "undefined".
    const hint = questionEl.dataset.hint || "";

    // Help whoever edits the HTML catch content mistakes early. These warnings
    // are for developers/content authors only and never reach the player.
    const correctCount = answers.filter((a) => a.correct).length;
    if (!questionEl.dataset.prompt) {
      console.warn(`Quiz question ${questionNumber + 1} is missing data-prompt.`);
    }
    if (answers.length < 2) {
      console.warn(
        `Quiz question ${questionNumber + 1} has fewer than 2 answers.`
      );
    }
    if (correctCount === 0) {
      console.warn(
        `Quiz question ${questionNumber + 1} has no answer marked data-correct="true"; it cannot be passed.`
      );
    }
    if (correctCount > 1) {
      console.warn(
        `Quiz question ${questionNumber + 1} has ${correctCount} correct answers marked; expected exactly 1.`
      );
    }

    return { prompt, hint, answers };
  });
}

/* ---- Element references --------------------------------------------------- */
const quiz = document.querySelector("[data-quiz]");
const quizForm = document.querySelector("#quiz-form");
const questionCard = document.querySelector("#question-card");
const answerList = document.querySelector("#answer-list");
const questionTitle = document.querySelector("#quiz-title");
const questionProgress = document.querySelector("#question-progress");
const progressCount = document.querySelector("#progress-count");
const progressDots = document.querySelector("#progress-dots");
const feedback = document.querySelector("#quiz-feedback");
const attemptStatus = document.querySelector("#attempt-status");
const warningCard = document.querySelector("#warning-card");
const reviewPanel = document.querySelector("#review-panel");
const reviewList = document.querySelector("#review-list");
const resultAnimation = document.querySelector("#result-animation");
const resultTitle = document.querySelector("#result-title");
const resultText = document.querySelector("#result-text");
const submitButton = document.querySelector("#submit-answer");
const backButton = document.querySelector("#nav-back");
const answerFeedback = document.querySelector("#answer-feedback");
const answerFeedbackGif = document.querySelector("#answer-feedback-gif");
const answerFeedbackText = document.querySelector("#answer-feedback-text");

/* ---- Configuration (read from the markup, not hard-coded) ----------------- */
const questions = readQuestionsFromDom();
// Fall back to 3 if data-max-attempts is missing or not a positive number,
// so a content mistake can never produce "NaN" or an un-failable quiz.
const DEFAULT_MAX_ATTEMPTS = 3;
const parsedMaxAttempts = Number(quiz.dataset.maxAttempts);
// `let`, because the sunset API may lower it once it resolves (see below).
let maxAttempts =
  Number.isInteger(parsedMaxAttempts) && parsedMaxAttempts > 0
    ? parsedMaxAttempts
    : DEFAULT_MAX_ATTEMPTS;
if (maxAttempts !== parsedMaxAttempts) {
  console.warn(
    `data-max-attempts ("${quiz.dataset.maxAttempts}") is invalid; using ${DEFAULT_MAX_ATTEMPTS}.`
  );
}
const duringMessage = quiz.dataset.duringMessage || "";
const totalQuestions = questions.length;

/* ---- State ---------------------------------------------------------------- */
let currentIndex = 0;
let usedAttempts = 0;
let quizIsFinished = false;
let awaitingRetry = false; // when true, the submit button means "Try Again"
let answerChecked = false; // when true, the current answer was checked and the
//                            button means "Next Question" (the second click)
// selections[i] = chosen answer index for question i, or null.
// Kept across tries so previous answers stay visible.
let selections = new Array(totalQuestions).fill(null);

/* ---- Setup ---------------------------------------------------------------- */
if (totalQuestions === 0) {
  // No questions in the markup: show a clear message instead of crashing.
  console.warn("No quiz questions found in #quiz-data.");
  questionTitle.textContent = "No questions are available.";
  answerList.innerHTML = "";
  submitButton.disabled = true;
  submitButton.classList.add("is-hidden");
  if (backButton) backButton.disabled = true;
  feedback.textContent = "This challenge has no questions yet.";
} else {
  buildProgressDots();
  updateAttemptStatus();
  renderQuestion();

  quizForm.addEventListener("submit", handleFormSubmit);

  if (backButton) {
    backButton.addEventListener("click", goToPreviousQuestion);
  }

  // Fetch the sunset time for the filming location. The quiz already works
  // with the default attempts; this only refines it once the data arrives.
  applySunsetConditions();
}

/* ---- Rendering: question view -------------------------------------------- */
function renderQuestion() {
  reviewPanel.classList.remove("is-visible");
  questionCard.classList.remove("is-hidden");
  answerList.classList.remove("is-hidden");

  // A freshly rendered question is unchecked: clear any previous feedback.
  answerChecked = false;
  hideAnswerFeedback();

  const question = questions[currentIndex];
  questionTitle.textContent = question.prompt;

  answerList.innerHTML = "";

  question.answers.forEach((answer, answerIndex) => {
    answerList.append(buildAnswerOption(answer, answerIndex));
  });

  updateProgressDisplay();
  updateNavButtons();
  updateSubmitLabel();

  // Neutral prompt during the round - no right/wrong yet.
  feedback.textContent = duringMessage;
  feedback.classList.remove("is-success", "is-error");
}

/* Build a single answer option. The radio's value is the answer index, so the
   chosen answer is referenced dynamically rather than by any fixed id. */
function buildAnswerOption(answer, answerIndex) {
  const optionId = `answer-${currentIndex}-${answerIndex}`;

  const wrapper = document.createElement("div");
  wrapper.className = "answer-option";

  const input = document.createElement("input");
  input.type = "radio";
  input.id = optionId;
  input.name = "quiz-answer";
  input.value = String(answerIndex);
  input.dataset.answer = "";

  // Restore previous selection so it stays visible on retry.
  if (selections[currentIndex] === answerIndex) {
    input.checked = true;
  }

  const label = document.createElement("label");
  label.setAttribute("for", optionId);

  const marker = document.createElement("span");
  marker.className = "answer-marker";
  marker.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.textContent = answer.label;

  label.append(marker, text);
  wrapper.append(input, label);
  return wrapper;
}

function updateSubmitLabel() {
  // A freshly shown question always starts in "check" mode. The label only
  // changes to "Next Question" / "See Results" after the answer is checked.
  submitButton.textContent = "Submit Answer";
}

function updateNavButtons() {
  if (!backButton) return;
  backButton.disabled = currentIndex === 0;
}

/* ---- Progress ------------------------------------------------------------- */
function buildProgressDots() {
  progressDots.innerHTML = "";
  for (let i = 0; i < totalQuestions; i += 1) {
    progressDots.append(document.createElement("span"));
  }
  updateProgressDots();
}

function updateProgressDisplay() {
  const humanIndex = currentIndex + 1;
  questionProgress.textContent = `Question ${humanIndex} of ${totalQuestions}`;
  progressCount.textContent = `${humanIndex} / ${totalQuestions}`;
  updateProgressDots();
}

function updateProgressDots() {
  const dots = progressDots.querySelectorAll("span");
  dots.forEach((dot, index) => {
    dot.classList.remove("is-complete", "is-current");
    if (index < currentIndex) dot.classList.add("is-complete");
    else if (index === currentIndex) dot.classList.add("is-current");
  });
}

/* ---- Navigation ----------------------------------------------------------- */
function handleFormSubmit(event) {
  event.preventDefault();
  if (quizIsFinished) return;

  // The submit button has three jobs depending on the current phase:
  //   1. retry the whole quiz (review is showing)
  //   2. advance to the next question (an answer was just checked)
  //   3. check the chosen answer (the default, first click on a question)
  if (awaitingRetry) {
    startRetry();
    return;
  }

  if (answerChecked) {
    goToNextStep();
    return;
  }

  checkCurrentAnswer();
}

/* Phase 3: check the selected answer, reveal right/wrong + Gollum, lock it. */
function checkCurrentAnswer() {
  const selected = answerList.querySelector("[data-answer]:checked");
  if (!selected) {
    showFeedback("Please choose an answer before continuing.", "error");
    return;
  }

  // Store the selection for this question (by index, read from the input).
  const chosenIndex = Number(selected.value);
  selections[currentIndex] = chosenIndex;

  const isCorrect = questions[currentIndex].answers[chosenIndex].correct;

  // Mark the chosen option visually and lock all options for this question.
  const chosenWrapper = selected.closest(".answer-option");
  chosenWrapper.classList.add(isCorrect ? "is-correct" : "is-wrong");
  lockAnswerOptions();

  showAnswerFeedback(isCorrect);

  // Flip the button into "advance" mode for the second click.
  answerChecked = true;
  const isLast = currentIndex === totalQuestions - 1;
  submitButton.textContent = isLast ? "See Results" : "Next Question";

  // The back button is meaningless once the answer is locked.
  if (backButton) backButton.disabled = true;
}

/* Phase 2: move on after feedback - next question, or grade the round. */
function goToNextStep() {
  answerChecked = false;
  hideAnswerFeedback();

  const isLast = currentIndex === totalQuestions - 1;
  if (isLast) {
    gradeRound();
  } else {
    currentIndex += 1;
    renderQuestion();
  }
}

/* Lock every answer option for the current question. */
function lockAnswerOptions() {
  answerList.querySelectorAll("[data-answer]").forEach((input) => {
    input.disabled = true;
  });
}

/* Show the per-question right/wrong indicator and the matching Gollum gif. */
function showAnswerFeedback(isCorrect) {
  const happyGif = answerFeedback.dataset.happyGif;
  const sadGif = answerFeedback.dataset.sadGif;
  const correctLabel = answerFeedback.dataset.correctLabel || "Correct!";
  const wrongLabel = answerFeedback.dataset.wrongLabel || "Wrong";

  answerFeedbackGif.src = isCorrect ? happyGif : sadGif;
  answerFeedbackGif.alt = isCorrect
    ? "Gollum looking happy"
    : "Gollum looking sad";
  answerFeedbackText.textContent = isCorrect ? correctLabel : wrongLabel;

  answerFeedback.classList.remove("is-correct", "is-wrong");
  answerFeedback.classList.add("is-visible", isCorrect ? "is-correct" : "is-wrong");
}

function hideAnswerFeedback() {
  answerFeedback.classList.remove("is-visible", "is-correct", "is-wrong");
  answerFeedbackGif.src = "";
  answerFeedbackGif.alt = "";
}

function goToPreviousQuestion() {
  // Ignore when finished, while the results screen is shown, or once the
  // current answer has been checked (it is locked and feedback is showing).
  if (currentIndex === 0 || quizIsFinished) return;
  if (reviewPanel.classList.contains("is-visible")) return;
  if (answerChecked) return;

  // Remember the current choice before stepping back, if any.
  const selected = answerList.querySelector("[data-answer]:checked");
  if (selected) {
    selections[currentIndex] = Number(selected.value);
  }

  currentIndex -= 1;
  renderQuestion();
}

/* ---- Grading + review ----------------------------------------------------- */
function gradeRound() {
  usedAttempts += 1;
  updateAttemptStatus();

  const correctCount = countCorrect();
  const allCorrect = correctCount === totalQuestions;

  showReview(correctCount);

  if (allCorrect) {
    finishQuizSuccessfully();
  } else if (usedAttempts >= maxAttempts) {
    failQuiz(correctCount);
  } else {
    offerRetry(correctCount);
  }
}

function countCorrect() {
  return questions.reduce((count, question, i) => {
    const chosen = selections[i];
    const isCorrect = chosen !== null && question.answers[chosen].correct;
    return count + (isCorrect ? 1 : 0);
  }, 0);
}

function showReview(correctCount) {
  // Hide the question, show the review panel.
  questionCard.classList.add("is-hidden");
  answerList.classList.add("is-hidden");
  reviewPanel.classList.add("is-visible");

  // On the results screen there are no questions to step back into,
  // so the back button is disabled until a retry returns to question 1.
  if (backButton) backButton.disabled = true;

  // Mark all dots complete.
  progressDots.querySelectorAll("span").forEach((dot) => {
    dot.classList.remove("is-current");
    dot.classList.add("is-complete");
  });
  questionProgress.textContent = `Score: ${correctCount} of ${totalQuestions} correct`;
  progressCount.textContent = `${correctCount} / ${totalQuestions}`;

  // Build the full review. For wrong answers we show a cryptic hint instead
  // of the solution, so the Fellowship must still reason it out on the retry.
  reviewList.innerHTML = "";
  questions.forEach((question, i) => {
    reviewList.append(buildReviewItem(question, i));
  });
}

/* Build one review row for a question, using the stored selection. */
function buildReviewItem(question, index) {
  const chosen = selections[index];
  const chosenAnswer = chosen !== null ? question.answers[chosen] : null;
  const wasCorrect = Boolean(chosenAnswer && chosenAnswer.correct);

  const item = document.createElement("div");
  item.className = `review-item ${wasCorrect ? "is-correct" : "is-wrong"}`;

  const prompt = document.createElement("p");
  prompt.className = "review-question";
  prompt.textContent = `${index + 1}. ${question.prompt}`;

  const yours = document.createElement("p");
  yours.className = "review-line";
  yours.textContent = chosenAnswer
    ? `Your answer: ${chosenAnswer.label}`
    : "Your answer: (none)";

  item.append(prompt, yours);

  // Only show a hint when the chosen answer was wrong AND a hint exists,
  // so a missing data-hint never renders as "Hint: undefined".
  if (!wasCorrect && question.hint) {
    const hint = document.createElement("p");
    hint.className = "review-line review-hint";
    hint.textContent = `Hint: ${question.hint}`;
    item.append(hint);
  }

  return item;
}

/* ---- End states ----------------------------------------------------------- */
function finishQuizSuccessfully() {
  quizIsFinished = true;
  showFeedback(quiz.dataset.successMessage, "success");
  showResultAnimation("correct");
  submitButton.classList.add("is-hidden");
  if (backButton) backButton.disabled = true;
  quiz.classList.add("is-locked");
}

function offerRetry(correctCount) {
  const triesLeft = maxAttempts - usedAttempts;
  showFeedback(
    `${correctCount} of ${totalQuestions} correct. Not all answers are right yet. ` +
      `Tries left: ${triesLeft}.`,
    "error"
  );
  showResultAnimation("wrong");

  // Turn the submit button into a retry control (handled by the flag).
  submitButton.textContent = "Try Again";
  submitButton.classList.remove("is-hidden");
  awaitingRetry = true;
}

function startRetry() {
  // Start a fresh run, keeping previous selections visible.
  awaitingRetry = false;
  currentIndex = 0;
  reviewPanel.classList.remove("is-visible");
  resultAnimation.classList.remove("is-visible", "is-correct", "is-wrong");
  renderQuestion();
}

function failQuiz(correctCount) {
  quizIsFinished = true;
  warningCard.classList.add("is-active");
  showFeedback(
    `${quiz.dataset.failMessage} (Final score: ${correctCount} of ${totalQuestions}.)`,
    "error"
  );
  showResultAnimation("wrong");
  submitButton.classList.add("is-hidden");
  if (backButton) backButton.disabled = true;
  quiz.classList.add("is-locked");
}

/* ---- Shared helpers ------------------------------------------------------- */
function showFeedback(message, type) {
  feedback.textContent = message;
  feedback.classList.remove("is-success", "is-error");
  if (type === "success") feedback.classList.add("is-success");
  else if (type === "error") feedback.classList.add("is-error");
}

function updateAttemptStatus() {
  attemptStatus.textContent = `${usedAttempts} of ${maxAttempts} used`;
  updateWarningText();
}

/* Keep the warning text in sync with the current number of attempts,
   which the sunset extension may lower from the default. */
function updateWarningText() {
  const warningText = document.querySelector("#warning-text");
  if (!warningText) return;
  const times = maxAttempts === 1 ? "once" : `up to ${maxAttempts} times`;
  warningText.textContent =
    `The whole quiz may be retried ${times}. After the last unsuccessful ` +
    `try, the Fellowship is marked as unprepared.`;
}

function showResultAnimation(type) {
  resultAnimation.classList.remove("is-correct", "is-wrong");
  resultAnimation.classList.add("is-visible");

  const titleKey = type === "correct" ? "correctTitle" : "wrongTitle";
  const textKey = type === "correct" ? "correctText" : "wrongText";

  resultAnimation.classList.add(type === "correct" ? "is-correct" : "is-wrong");
  resultTitle.textContent = resultAnimation.dataset[titleKey];
  resultText.textContent = resultAnimation.dataset[textKey];
}

/* ============================================================
   Sunset extension (Open-Meteo)
   ------------------------------------------------------------
   Fetches today's sunset for the Lord of the Rings filming
   location (Hobbiton, New Zealand) and shows it at the top.
   If darkness is near, the Fellowship gets one fewer attempt:
   the gate becomes harder when night is closing in.

   This affects behaviour (the number of tries), not just looks,
   and it builds on the existing quiz rather than adding a new
   feature. It needs no API key and no backend - a single fetch.
   If the request fails, the quiz simply keeps the default tries.
   ============================================================ */
function applySunsetConditions() {
  const lat = quiz.dataset.sunsetLat;
  const lon = quiz.dataset.sunsetLon;
  const place = quiz.dataset.sunsetPlace || "the filming location";
  const reduced = Number(quiz.dataset.reducedAttempts);

  // Without coordinates we can't ask; leave the default tries in place.
  if (!lat || !lon) return;

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lon}` +
    "&daily=sunset&timezone=auto&forecast_days=1";

  fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      const sunsetIso = data && data.daily && data.daily.sunset && data.daily.sunset[0];
      if (!sunsetIso) throw new Error("No sunset in response");
      showSunset(sunsetIso, place, reduced);
    })
    .catch((error) => {
      // Network or data problem: the quiz still works with default tries.
      console.warn("Sunset lookup failed; keeping default attempts.", error);
    });
}

/* Show the sunset time and, if darkness is near, lower the attempts. */
function showSunset(sunsetIso, place, reducedAttempts) {
  const sunsetLine = document.querySelector("#sunset-line");
  const sunset = new Date(sunsetIso);

  // Format the time using the visitor's locale (e.g. "5:14 PM" / "17:14").
  const time = sunset.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // "Darkness is near" if sunset is within the next 2 hours (or already past).
  const now = new Date();
  const hoursUntilSunset = (sunset - now) / (1000 * 60 * 60);
  const darknessNear = hoursUntilSunset <= 2;

  // Only lower attempts if a valid reduced value is configured, the round
  // hasn't started, and we wouldn't go below 1.
  const canReduce =
    Number.isInteger(reducedAttempts) &&
    reducedAttempts > 0 &&
    reducedAttempts < maxAttempts;

  if (darknessNear && canReduce && usedAttempts === 0 && !quizIsFinished) {
    maxAttempts = reducedAttempts;
    updateAttemptStatus();
  }

  if (sunsetLine) {
    sunsetLine.textContent = darknessNear
      ? `Sunset over ${place}: ${time} — darkness is near`
      : `Sunset over ${place}: ${time}`;
  }
}
