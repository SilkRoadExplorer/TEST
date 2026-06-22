/* ============================================================
   The Shire Guide - Knowledge Challenge
   Logic for a 5-question gate before a new journey section.

   Rules (from our system flow):
   - The Fellowship answers a set of questions before a section.
   - Up to 3 wrong answers IN TOTAL are allowed across the quiz.
   - A correct answer advances automatically to the next question.
   - After 3 total wrong answers, the Fellowship is marked unprepared.
   - Passing all questions unlocks the next section.
   ============================================================ */

/* ---- Question data -------------------------------------------------------
   Each question carries its own hint and per-answer feedback, so the data
   array is the single source of truth. The HTML is only the shell. */
const questions = [
  {
    prompt: "What makes the Midgewater Marshes dangerous at night?",
    hint: "Think about what becomes harder to judge when the Fellowship travels through marshland in darkness.",
    answers: [
      {
        label: "Unstable Ground",
        correct: true,
        feedback:
          "Correct. The unstable ground makes the Midgewater Marshes dangerous at night.",
      },
      {
        label: "Marsh Wraiths",
        correct: false,
        feedback:
          "Not quite. Marsh Wraiths sound threatening, but they are not the correct danger here.",
      },
      {
        label: "Poisonous Water",
        correct: false,
        feedback:
          "Not quite. Poisonous water is not the main danger described in this question.",
      },
      {
        label: "No Safe Paths",
        correct: false,
        feedback: "Close, but not precise enough. The main danger is the unstable ground.",
      },
    ],
  },
  {
    prompt: "Why does the Fellowship travel away from the main road?",
    hint: "Consider who might be watching the open roads.",
    answers: [
      {
        label: "To avoid being seen by the Riders",
        correct: true,
        feedback: "Correct. Staying off the road keeps the Fellowship hidden from the Riders.",
      },
      {
        label: "The road is flooded",
        correct: false,
        feedback: "Not quite. Flooding is not the reason the road is avoided here.",
      },
      {
        label: "It is a shorter route",
        correct: false,
        feedback: "Not quite. The off-road path is harder, not shorter.",
      },
      {
        label: "To find better food",
        correct: false,
        feedback: "Not quite. Foraging is not why the road itself is avoided.",
      },
    ],
  },
  {
    prompt: "What should the Fellowship do before resting for the night?",
    hint: "A good camp is chosen, not stumbled into.",
    answers: [
      {
        label: "Check the ground and surroundings",
        correct: true,
        feedback: "Correct. Assessing the ground and surroundings keeps the camp safe.",
      },
      {
        label: "Light a large fire",
        correct: false,
        feedback: "Not quite. A large fire would draw attention to the camp.",
      },
      {
        label: "Keep marching through the night",
        correct: false,
        feedback: "Not quite. The question is about resting, not avoiding rest.",
      },
      {
        label: "Split the group up",
        correct: false,
        feedback: "Not quite. Splitting up would make the Fellowship more vulnerable.",
      },
    ],
  },
  {
    prompt: "Why is Weathertop a useful landmark for the Fellowship?",
    hint: "Think about what a high, open hill lets you do.",
    answers: [
      {
        label: "It offers a wide view of the land",
        correct: true,
        feedback: "Correct. The high vantage point lets the Fellowship watch the land around them.",
      },
      {
        label: "It has a hidden market",
        correct: false,
        feedback: "Not quite. Weathertop is a ruin, not a place of trade.",
      },
      {
        label: "It is always safe",
        correct: false,
        feedback: "Not quite. An exposed hilltop carries its own risks.",
      },
      {
        label: "It has fresh supplies",
        correct: false,
        feedback: "Not quite. Weathertop is not a source of supplies.",
      },
    ],
  },
  {
    prompt: "What is the greatest risk of an open hilltop like Weathertop?",
    hint: "What can see you, when you can see far?",
    answers: [
      {
        label: "Being visible from far away",
        correct: true,
        feedback: "Correct. A high, open place makes the Fellowship easy to spot from a distance.",
      },
      {
        label: "Falling rocks",
        correct: false,
        feedback: "Not quite. Loose rock is a minor concern compared to being seen.",
      },
      {
        label: "Too much shade",
        correct: false,
        feedback: "Not quite. Shade is not the main risk on an exposed hilltop.",
      },
      {
        label: "Crowded paths",
        correct: false,
        feedback: "Not quite. The wilds around Weathertop are empty, not crowded.",
      },
    ],
  },
];

/* ---- Element references --------------------------------------------------- */
const quiz = document.querySelector("[data-quiz]");
const quizForm = document.querySelector("#quiz-form");
const answerList = document.querySelector("#answer-list");
const questionTitle = document.querySelector("#quiz-title");
const questionProgress = document.querySelector("#question-progress");
const progressCount = document.querySelector("#progress-count");
const progressDots = document.querySelector("#progress-dots");
const feedback = document.querySelector("#quiz-feedback");
const attemptStatus = document.querySelector("#attempt-status");
const hintCard = document.querySelector("#hint-card");
const hintText = document.querySelector("#hint-text");
const warningCard = document.querySelector("#warning-card");
const resultAnimation = document.querySelector("#result-animation");
const resultTitle = document.querySelector("#result-title");
const resultText = document.querySelector("#result-text");
const submitButton = document.querySelector("#submit-answer");

/* ---- State ---------------------------------------------------------------- */
const maxAttempts = Number(quiz.dataset.maxAttempts);
const totalQuestions = questions.length;

let currentIndex = 0;
let usedAttempts = 0;
let quizIsFinished = false;
let advanceTimer = null;

/* ---- Setup ---------------------------------------------------------------- */
buildProgressDots();
renderQuestion();
updateAttemptStatus();

quizForm.addEventListener("submit", handleSubmitAnswer);

/* ---- Rendering ------------------------------------------------------------ */
function renderQuestion() {
  const question = questions[currentIndex];

  questionTitle.textContent = question.prompt;
  hintCard.dataset.hint = question.hint;

  // Build the answer options for this question.
  answerList.innerHTML = "";

  question.answers.forEach((answer, answerIndex) => {
    const optionId = `answer-${currentIndex}-${answerIndex}`;

    const wrapper = document.createElement("div");
    wrapper.className = "answer-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.id = optionId;
    input.name = "quiz-answer";
    input.value = String(answerIndex);
    input.dataset.answer = "";
    input.dataset.correct = String(answer.correct);
    input.dataset.feedback = answer.feedback;
    input.addEventListener("change", clearAnswerStates);

    const label = document.createElement("label");
    label.setAttribute("for", optionId);

    const marker = document.createElement("span");
    marker.className = "answer-marker";
    marker.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = answer.label;

    label.append(marker, text);
    wrapper.append(input, label);
    answerList.append(wrapper);
  });

  // Reset the per-question UI.
  updateProgressDisplay();
  resetFeedbackForNewQuestion();
}

function buildProgressDots() {
  progressDots.innerHTML = "";

  for (let i = 0; i < totalQuestions; i += 1) {
    const dot = document.createElement("span");
    progressDots.append(dot);
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

    if (index < currentIndex) {
      dot.classList.add("is-complete");
    } else if (index === currentIndex) {
      dot.classList.add("is-current");
    }
  });
}

function resetFeedbackForNewQuestion() {
  feedback.textContent = "Choose an answer to help the Fellowship prepare.";
  feedback.classList.remove("is-success", "is-error");

  hintCard.classList.remove("is-visible");
  hintText.textContent = "A hint will appear after a wrong answer.";

  resultAnimation.classList.remove("is-visible", "is-correct", "is-wrong");
}

/* ---- Answer handling ------------------------------------------------------ */
function handleSubmitAnswer(event) {
  event.preventDefault();

  if (quizIsFinished) {
    return;
  }

  const selectedAnswer = document.querySelector("[data-answer]:checked");

  if (!selectedAnswer) {
    showFeedback("Please choose an answer before submitting.", "error");
    return;
  }

  const isCorrect = selectedAnswer.dataset.correct === "true";

  if (isCorrect) {
    handleCorrectAnswer(selectedAnswer);
  } else {
    handleWrongAnswer(selectedAnswer);
  }
}

function handleCorrectAnswer(selectedAnswer) {
  const answerWrapper = selectedAnswer.closest(".answer-option");
  answerWrapper.classList.add("is-correct");

  showFeedback(selectedAnswer.dataset.feedback, "success");
  showResultAnimation("correct");

  // Lock the current question briefly, then advance.
  lockAnswers();

  const isLastQuestion = currentIndex === totalQuestions - 1;

  advanceTimer = window.setTimeout(() => {
    if (isLastQuestion) {
      finishQuizSuccessfully();
    } else {
      currentIndex += 1;
      renderQuestion();
      unlockAnswers();
    }
  }, 1200);
}

function handleWrongAnswer(selectedAnswer) {
  usedAttempts += 1;
  updateAttemptStatus();

  const answerWrapper = selectedAnswer.closest(".answer-option");
  answerWrapper.classList.add("is-wrong");

  showFeedback(selectedAnswer.dataset.feedback, "error");
  showHint();
  showResultAnimation("wrong");

  if (usedAttempts >= maxAttempts) {
    failQuiz();
  }
}

/* ---- End states ----------------------------------------------------------- */
function finishQuizSuccessfully() {
  quizIsFinished = true;

  // Mark all dots complete.
  currentIndex = totalQuestions;
  updateProgressDots();
  questionProgress.textContent = `Completed ${totalQuestions} of ${totalQuestions}`;
  progressCount.textContent = `${totalQuestions} / ${totalQuestions}`;

  showFeedback(quiz.dataset.successMessage, "success");
  showResultAnimation("correct");
  lockQuiz();
}

function failQuiz() {
  quizIsFinished = true;
  warningCard.classList.add("is-active");
  showFeedback(quiz.dataset.failMessage, "error");
  lockQuiz();
}

/* ---- Feedback + status helpers ------------------------------------------- */
function showFeedback(message, type) {
  feedback.textContent = message;
  feedback.classList.remove("is-success", "is-error");

  if (type === "success") {
    feedback.classList.add("is-success");
  } else if (type === "error") {
    feedback.classList.add("is-error");
  }
}

function showHint() {
  hintCard.classList.add("is-visible");
  hintText.textContent = hintCard.dataset.hint;
}

function updateAttemptStatus() {
  attemptStatus.textContent = `${usedAttempts} of ${maxAttempts} used`;
}

function showResultAnimation(type) {
  resultAnimation.classList.remove("is-correct", "is-wrong");
  resultAnimation.classList.add("is-visible");

  if (type === "correct") {
    resultAnimation.classList.add("is-correct");
    resultTitle.textContent = resultAnimation.dataset.correctTitle;
    resultText.textContent = resultAnimation.dataset.correctText;
  } else if (type === "wrong") {
    resultAnimation.classList.add("is-wrong");
    resultTitle.textContent = resultAnimation.dataset.wrongTitle;
    resultText.textContent = resultAnimation.dataset.wrongText;
  }
}

function clearAnswerStates() {
  const answerWrappers = document.querySelectorAll(".answer-option");
  answerWrappers.forEach((wrapper) => {
    wrapper.classList.remove("is-correct", "is-wrong");
  });
}

/* ---- Locking -------------------------------------------------------------- */
function lockAnswers() {
  const answerInputs = document.querySelectorAll("[data-answer]");
  answerInputs.forEach((input) => {
    input.disabled = true;
  });
  submitButton.disabled = true;
}

function unlockAnswers() {
  const answerInputs = document.querySelectorAll("[data-answer]");
  answerInputs.forEach((input) => {
    input.disabled = false;
  });
  submitButton.disabled = false;
}

function lockQuiz() {
  quiz.classList.add("is-locked");
  lockAnswers();
}
